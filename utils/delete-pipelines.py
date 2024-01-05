import boto3

chime = boto3.client('chime-sdk-media-pipelines')

response = chime.list_media_pipelines()
pipelines = response['MediaPipelines']
print('Found', len(pipelines), 'pipelines')

for pipeline in pipelines:
    pipeline_id = pipeline['MediaPipelineId']
    print('Deleting media pipeline:', pipeline_id)
    chime.delete_media_pipeline(MediaPipelineId=pipeline_id)
