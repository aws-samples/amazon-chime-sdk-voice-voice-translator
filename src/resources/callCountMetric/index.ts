/* eslint-disable import/no-extraneous-dependencies */
import {
  CloudWatchClient,
  PutMetricDataCommand,
  StandardUnit,
} from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { ECSClient, DescribeClustersCommand } from '@aws-sdk/client-ecs';

const CALL_COUNT_TABLE = process.env.CALL_COUNT_TABLE;
const FARGATE_CLUSTER = process.env.FARGATE_CLUSTER || '';
const AWS_REGION = process.env.AWS_REGION;

const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const cloudWatchClient = new CloudWatchClient({ region: AWS_REGION });

export const handler = async () => {
  try {
    const callCount = await queryDynamo();

    if (callCount) {
      await putMetrics(callCount, 'CallCount');
      console.log(`Pushed metric: CallCountMetric=${callCount}`);
    } else {
      console.warn('No call count data found in DynamoDB.');
    }
    const runningTasksCount = await getRunningTaskCount();
    if (runningTasksCount) {
      await putMetrics(runningTasksCount, 'TaskCount');
      console.log(
        `Pushed metric: RunningTasksCountMetric=${runningTasksCount}`,
      );
    } else {
      console.warn('No running tasks found in ECS.');
    }
    if (callCount && runningTasksCount) {
      await putMetrics(callCount / runningTasksCount, 'CallsPerTask');
      console.log(
        `Pushed metric: CallsPerTask=${callCount / runningTasksCount}`,
      );
    } else {
      console.warn('No call count data found in DynamoDB.');
    }

    return {
      statusCode: 200,
      body: 'Metric pushed successfully.',
    };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

const putMetrics = async (value: number, metricName: string) => {
  const metricData = {
    MetricData: [
      {
        MetricName: metricName,
        Value: value,
        Unit: StandardUnit.Count,
      },
    ],
    Namespace: 'AmazonChimeSDKKVSProcessing',
  };

  await cloudWatchClient.send(new PutMetricDataCommand(metricData));
};

const queryDynamo = async () => {
  const queryParams = {
    TableName: CALL_COUNT_TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: 'currentCalls' },
    },
  };
  const queryResult = await ddbClient.send(new QueryCommand(queryParams));
  if (
    queryResult &&
    queryResult.Items &&
    queryResult.Items.length > 0 &&
    queryResult.Items[0].calls
  ) {
    const callCount = queryResult.Items[0].calls.N!;
    return parseInt(callCount);
  }
  return false;
};

async function getRunningTaskCount(): Promise<number> {
  const ecsClient = new ECSClient({ region: 'us-east-1' });

  const data = await ecsClient.send(
    new DescribeClustersCommand({
      clusters: [FARGATE_CLUSTER],
    }),
  );

  const cluster = data.clusters![0];

  return cluster.runningTasksCount!;
}
