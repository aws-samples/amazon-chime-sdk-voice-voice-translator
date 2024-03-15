import { randomUUID } from 'crypto';
import {
  ChimeSDKMeetingsClient,
  DeleteMeetingCommand,
  CreateMeetingWithAttendeesCommand,
} from '@aws-sdk/client-chime-sdk-meetings';
import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { TranslatorTransactionAttributes, CallResponse } from '.';
import { speakAction } from './actions';
import {
  SipMediaApplicationEvent,
  PollyLanguageCodes,
  Actions,
} from './sip-media-application';

const MEETING_TABLE = process.env.MEETING_TABLE;
const CALL_COUNT_TABLE = process.env.CALL_COUNT_TABLE;
const AWS_REGION = process.env.AWS_REGION;

const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const chimeSDKMeetingClient = new ChimeSDKMeetingsClient({
  region: AWS_REGION,
});

export async function createMeeting() {
  console.log('Creating Meeting for Request ID');
  try {
    const meetingInfo = await chimeSDKMeetingClient.send(
      new CreateMeetingWithAttendeesCommand({
        ClientRequestToken: randomUUID(),
        MediaRegion: AWS_REGION,
        ExternalMeetingId: 'VoiceVoiceTranslator',
        Attendees: [
          {
            ExternalUserId: 'InboundCallAttendee',
            Capabilities: {
              Audio: 'SendReceive',
              Video: 'None',
              Content: 'None',
            },
          },
        ],
      }),
    );
    return meetingInfo;
  } catch (error) {
    console.info(`Error: ${error}`);
    throw error;
  }
}

export async function deleteMeeting(meetingId: string) {
  console.log(`Deleting Meeting: ${meetingId}`);
  try {
    await chimeSDKMeetingClient.send(
      new DeleteMeetingCommand({ MeetingId: meetingId }),
    );
  } catch (error) {
    console.error(`Error: ${error}`);
  }
}

export async function writeMeetingInfoToDB(
  meetingId: string,
  attendeeType: string,
  attendeeId: string,
  transactionId: string,
  language: string,
  calledNumber?: string,
  toCallLanguage?: string,
  toCallNumber?: string,
) {
  const params = {
    TableName: MEETING_TABLE,
    Item: {
      meetingId: { S: meetingId },
      attendeeType: { S: attendeeType },
      attendeeId: { S: attendeeId },
      transactionId: { S: transactionId },
      language: { S: language },
      ...(calledNumber ? { calledNumber: { S: calledNumber } } : {}),
      ...(toCallLanguage ? { toCallLanguage: { S: toCallLanguage } } : {}),
      ...(toCallNumber ? { toCallNumber: { S: toCallNumber } } : {}),
    },
  };
  console.log(`Writing to DynamoDB: ${JSON.stringify(params)}`);
  try {
    await ddbClient.send(new PutItemCommand(params));
    console.log(
      `Meeting info written to DB for meetingId: ${meetingId} for ${attendeeId}`,
    );
  } catch (error) {
    console.error(`Error writing to DB: ${error}`);
    throw error;
  }
}

export async function updateCallCount(value: number) {
  console.log(`Updating call count with : ${value}`);
  try {
    const updateParams = {
      TableName: CALL_COUNT_TABLE,
      Key: { pk: { S: 'currentCalls' } },
      UpdateExpression: 'ADD #calls :val',
      ExpressionAttributeNames: {
        '#calls': 'calls',
      },
      ExpressionAttributeValues: {
        ':val': { N: value.toString() },
      },
    };

    const response = await ddbClient.send(new UpdateItemCommand(updateParams));
    console.log(response);
  } catch (error) {
    console.error('Error:', error);
  }
}

export function convertLanguageToISOCode(language: string): string {
  const languageMap: Record<string, string> = {
    passthru: 'en-US',
    german: 'de-DE',
    portuguese: 'pt-BR',
    french: 'fr-FR',
    spanish: 'es-US',
    hindi: 'hi-IN',
  };

  return languageMap[language.toLowerCase()];
}

export function setCallId(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
) {
  const legAParticipant = event.CallDetails.Participants.find(
    (participant) => participant.ParticipantTag === 'LEG-A',
  );
  const legBParticipant = event.CallDetails.Participants.find(
    (participant) => participant.ParticipantTag === 'LEG-B',
  );

  transactionAttributes.CallIdLegA = legAParticipant
    ? legAParticipant.CallId
    : '';
  transactionAttributes.CallIdLegB = legBParticipant
    ? legBParticipant.CallId
    : '';
  return { transactionAttributes };
}

export function processCallResponse(
  transactionAttributes: TranslatorTransactionAttributes,
  actions: Actions[],
  callLeg: string,
) {
  if (transactionAttributes.CallResponse) {
    let existingCallResponse: CallResponse[] = JSON.parse(
      transactionAttributes.CallResponse,
    ) as CallResponse[];
    if ((existingCallResponse.length = 0)) {
      console.log('No existingCallResponse found.');
    } else if ((existingCallResponse.length = 1)) {
      console.log(
        '1 existingCallResponse found.  Removing first object in list',
      );
      existingCallResponse.shift();
      transactionAttributes.CallResponse = JSON.stringify(existingCallResponse);
    } else if (existingCallResponse.length > 1) {
      console.log(
        '>1 existingCallResponse found.  Removing first object in list and playing second object.',
      );
      transactionAttributes.CallResponse = JSON.stringify(existingCallResponse);
      actions = [
        speakAction(
          existingCallResponse[1].Text,
          existingCallResponse[1].Language as PollyLanguageCodes,
          callLeg,
        ),
      ];
      existingCallResponse.shift();
    }
  }
  return { transactionAttributes, actions };
}

export function determineCallLeg(
  transactionAttributes: TranslatorTransactionAttributes,
): string {
  return transactionAttributes.AttendeeType === 'OutboundCallAttendee'
    ? transactionAttributes.CallIdLegB!
    : transactionAttributes.CallIdLegA!;
}

export function handleExistingResponse(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
  existingCallResponse: CallResponse[],
  callLeg: string,
  actions: Actions[],
) {
  console.log(
    'Found an existing Response being played. Caching the new request in TransactionAttributes',
  );
  if (
    transactionAttributes.PreviousInterruption &&
    transactionAttributes.PreviousInterruption === 'true'
  ) {
    console.log(
      'PreviousInterruption set to true. Playing previous and current messages.',
    );
    console.info(`callLeg; ${callLeg}`);
    console.info(`Text; ${event.ActionData!.Parameters.Arguments.Text}`);
    console.info(
      `Language; ${event.ActionData!.Parameters.Arguments.Language}`,
    );
    actions.push(
      speakAction(
        existingCallResponse[0].Text,
        existingCallResponse[0].Language as PollyLanguageCodes,
        callLeg,
      ),
      speakAction(
        event.ActionData!.Parameters.Arguments.Text,
        event.ActionData!.Parameters.Arguments.Language as PollyLanguageCodes,
        callLeg,
      ),
    );
    transactionAttributes.PreviousInterruption = 'false';
    existingCallResponse.shift();
  }
  existingCallResponse.push(createCallResponse(event));
  transactionAttributes.CallResponse = JSON.stringify(existingCallResponse);
  return { transactionAttributes, actions };
}

export function handleNewResponse(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
  callLeg: string,
  actions: Actions[],
) {
  console.log(
    'No existing Response being played. Playing the Request and storing information in TransactionAttributes',
  );
  console.info(`callLeg; ${callLeg}`);
  console.info(`Text; ${event.ActionData!.Parameters.Arguments.Text}`);
  console.info(`Language; ${event.ActionData!.Parameters.Arguments.Language}`);
  transactionAttributes.CallResponse = JSON.stringify([
    createCallResponse(event),
  ]);
  actions.push(
    speakAction(
      event.ActionData!.Parameters.Arguments.Text,
      event.ActionData!.Parameters.Arguments.Language as PollyLanguageCodes,
      callLeg,
    ),
  );
  return { transactionAttributes, actions };
}

function createCallResponse(event: SipMediaApplicationEvent): CallResponse {
  return {
    AttendeeType: event.ActionData!.Parameters.Arguments.AttendeeType,
    Language: event.ActionData!.Parameters.Arguments.Language,
    Text: event.ActionData!.Parameters.Arguments.Text,
  };
}
