import { PassThrough, Readable } from 'stream';
import {
  ChimeSDKVoiceClient,
  UpdateSipMediaApplicationCallCommand,
  ChimeSDKVoiceServiceException,
} from '@aws-sdk/client-chime-sdk-voice';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import {
  KinesisVideoClient,
  GetDataEndpointCommand,
  APIName,
} from '@aws-sdk/client-kinesis-video';
import {
  KinesisVideoMedia,
  GetMediaCommandInput,
  StartSelectorType,
} from '@aws-sdk/client-kinesis-video-media';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  LanguageCode,
  MediaEncoding,
} from '@aws-sdk/client-transcribe-streaming';
import {
  TranslateClient,
  TranslateTextCommand,
} from '@aws-sdk/client-translate';
import Fastify from 'fastify';
import ffmpeg from 'fluent-ffmpeg';

const fastify = Fastify({
  logger: true,
});

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const SIP_MEDIA_APPLICATION_ID = process.env.SIP_MEDIA_APPLICATION_ID || '';
const MEETING_TABLE = process.env.MEETING_TABLE || '';

const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const chimeSdkVoiceClient = new ChimeSDKVoiceClient({ region: AWS_REGION });
const translateClient = new TranslateClient({ region: AWS_REGION });

declare global {
  var externalUserId: string;
}

interface KVSStreamDetails {
  streamArn: string;
  meetingId: string;
  attendeeId: string;
}

interface Event {
  startFragmentNumber: string;
  meetingId: string;
  attendeeId: string;
  callStreamingStartTime: string;
  callerStreamArn: string;
  externalUserId: string;
}

fastify.post('/call', async (request, reply) => {
  try {
    const event = request.body as Event;
    console.log('EVENT:', JSON.stringify(event));

    const streamArn = event.callerStreamArn;
    const meetingId = event.meetingId;
    const attendeeId = event.attendeeId;
    global.externalUserId = event.externalUserId;

    console.log(externalUserId, ': Starting KVS Convert');
    await reply.send({
      message: 'Request received. Processing in progress...',
    });
    await readKVSConvertWriteAndTranscribe({
      streamArn,
      meetingId,
      attendeeId,
    });
    console.log('Streaming and conversion to PCM completed');
  } catch (error) {
    console.error('Error:', error);
    await reply.status(500).send({ error: 'Internal Server Error' });
  }
});

fastify.get('/', async (_request, reply) => {
  await reply.status(200).send('OK');
});

async function readKVSConvertWriteAndTranscribe({
  streamArn,
  meetingId,
  attendeeId,
}: KVSStreamDetails): Promise<void> {
  console.log(externalUserId, ': Initializing media stream client');
  const kvClient = new KinesisVideoClient({ region: AWS_REGION });
  const getDataCmd = new GetDataEndpointCommand({
    APIName: APIName.GET_MEDIA,
    StreamARN: streamArn,
  });

  console.log(externalUserId, ': Fetching data endpoint');
  const response = await kvClient.send(getDataCmd);
  const mediaClient = new KinesisVideoMedia({
    region: AWS_REGION,
    endpoint: response.DataEndpoint,
  });

  console.log(externalUserId, ': Setting up fragment selector');
  const fragmentSelector: GetMediaCommandInput = {
    StreamARN: streamArn,
    StartSelector: {
      StartSelectorType: StartSelectorType.NOW,
    },
  };
  const result = await mediaClient.getMedia(fragmentSelector);
  const readableStream = (await result.Payload) as Readable;
  const outputStream = new PassThrough();

  ffmpeg(readableStream)
    // .on('stderr', (data) => {
    //   console.log(data);
    // })
    .audioCodec('libopus')
    .format('opus')
    .output(outputStream, { end: true })
    .run();

  startTranscription(outputStream, meetingId, attendeeId).catch((error) => {
    console.error('Transcription error:', error);
  });
}

const start = async () => {
  try {
    await fastify.listen({ port: 80, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
void start();

async function startTranscription(
  stream: Readable,
  meetingId: string,
  attendeeId: string,
) {
  const client = new TranscribeStreamingClient({ region: AWS_REGION });
  console.log(externalUserId, ': Starting Transcribe');

  const audioStream = async function* () {
    for await (const chunk of stream) {
      yield { AudioEvent: { AudioChunk: chunk } };
    }
  };

  let speakerLanguage: string = '';
  let listenerLanguage: string = '';
  let listenerTransactionId: string = '';
  let attendeeType: string = '';

  const databaseResponse = await readMeetingInfoFromDB(meetingId);
  if (databaseResponse) {
    const speakerAttendee = databaseResponse.find(
      (item) => item.attendeeId.S === attendeeId,
    );
    const listenerAttendee = databaseResponse.find(
      (item) => item.attendeeId.S != attendeeId,
    );
    if (speakerAttendee) {
      console.log(
        externalUserId,
        ': Speaker Attendee: ',
        JSON.stringify(speakerAttendee),
      );
      speakerLanguage = speakerAttendee!.language!.S! as LanguageCode;
    }
    if (listenerAttendee) {
      console.log(
        externalUserId,
        ': Listener Attendee: ',
        JSON.stringify(listenerAttendee),
      );
      listenerTransactionId = listenerAttendee!.transactionId!.S!;
      listenerLanguage = listenerAttendee!.language!.S! as LanguageCode;
      attendeeType = listenerAttendee!.attendeeType!.S!;
    }
  }

  try {
    const command = new StartStreamTranscriptionCommand({
      LanguageCode: speakerLanguage as LanguageCode,
      MediaEncoding: MediaEncoding.OGG_OPUS,
      MediaSampleRateHertz: 48000,
      AudioStream: audioStream(),
    });

    const response = await client.send(command);
    console.log(
      externalUserId,
      ': Transcription Response: ',
      JSON.stringify(response),
    );

    if (response.TranscriptResultStream) {
      for await (const event of response.TranscriptResultStream) {
        if (
          event.TranscriptEvent &&
          event.TranscriptEvent &&
          event.TranscriptEvent.Transcript &&
          event.TranscriptEvent.Transcript.Results &&
          event.TranscriptEvent.Transcript.Results.length > 0 &&
          event.TranscriptEvent.Transcript.Results[0].IsPartial == false
        ) {
          console.log(
            externalUserId,
            ': NonPartial Event: ',
            JSON.stringify(event.TranscriptEvent.Transcript),
          );

          if (speakerLanguage != listenerLanguage) {
            const translateResponse = await translateText(
              event.TranscriptEvent.Transcript.Results[0].Alternatives![0]
                .Transcript!,
              speakerLanguage,
              listenerLanguage,
            );

            console.log(
              externalUserId,
              ': Translated Response: ',
              translateResponse,
            );

            await updateSIPMediaApplication({
              transactionId: listenerTransactionId,
              action: 'Response',
              language: listenerLanguage,
              text: translateResponse!,
              attendeeType: attendeeType,
            });
          }
        }
      }
    } else {
      console.error('TranscriptResultStream is undefined');
    }
  } catch (error) {
    console.error('Error in transcription:', error);
  }
}

async function readMeetingInfoFromDB(meetingId: string) {
  const params = {
    TableName: MEETING_TABLE,
    KeyConditionExpression: 'meetingId = :id',
    ExpressionAttributeValues: {
      ':id': { S: meetingId },
    },
  };

  try {
    const data = await ddbClient.send(new QueryCommand(params));
    if (data.Items) {
      console.log(
        `${externalUserId}: Retrieved meeting info for meetingId: ${meetingId}`,
      );
      return data.Items;
    } else {
      console.log(
        `${externalUserId}: No meeting found for meetingId: ${meetingId}`,
      );
      return null;
    }
  } catch (error) {
    console.error(`Error reading from DB: ${error}`);
    throw error;
  }
}

async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
) {
  console.log(externalUserId, ': Translating text');
  const response = await translateClient.send(
    new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: sourceLang,
      TargetLanguageCode: targetLang,
    }),
  );

  return response.TranslatedText;
}

interface UpdateSIPMediaApplicationOptions {
  transactionId: string;
  action: string;
  language: string;
  text: string;
  attendeeType: string;
}

async function updateSIPMediaApplication(
  options: UpdateSIPMediaApplicationOptions,
) {
  const { transactionId, action, text, language, attendeeType } = options;

  const params = {
    SipMediaApplicationId: SIP_MEDIA_APPLICATION_ID,
    TransactionId: transactionId,
    Arguments: {
      Function: action,
      Text: text,
      Language: language,
      AttendeeType: attendeeType,
    },
  };
  console.log(
    externalUserId,
    ': Params for UpdateSipMediaApplicationCall: ',
    JSON.stringify(params),
  );
  try {
    await chimeSdkVoiceClient.send(
      new UpdateSipMediaApplicationCallCommand(params),
    );
  } catch (error) {
    if (error instanceof ChimeSDKVoiceServiceException) {
      console.error('Error Updating SIP Media Application: ', error.message);
      throw error;
    }
  }
}
