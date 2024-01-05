import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('AmazonChimeSDKVoiceVoiceTranslator-databaseResourcesmeetingTable30BCA192-1X4Q0A7AR5TMM')
# table = dynamodb.Table('AmazonChimeSDKKinesisProcessing-databaseResourcesmeetingTable30BCA192-HZR6C1LY1BLK')
chime = boto3.client('chime-sdk-meetings')

response = table.scan()
meeting_ids = response['Items']

for meeting in meeting_ids:
    meeting_id = meeting['meetingId']
    chime.delete_meeting(MeetingId=meeting_id)

