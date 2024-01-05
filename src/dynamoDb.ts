import { RemovalPolicy } from 'aws-cdk-lib';
import {
  AttributeType,
  TableV2,
  TableEncryptionV2,
  Billing,
} from 'aws-cdk-lib/aws-dynamodb';
import {
  AwsCustomResource,
  PhysicalResourceId,
  AwsCustomResourcePolicy,
} from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class DatabaseResources extends Construct {
  public meetingTable: TableV2;
  public callCountTable: TableV2;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.meetingTable = new TableV2(this, 'meetingTable', {
      partitionKey: {
        name: 'meetingId',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'attendeeId',
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: TableEncryptionV2.awsManagedKey(),
      billing: Billing.onDemand(),
    });

    this.callCountTable = new TableV2(this, 'callCountTable', {
      partitionKey: {
        name: 'pk',
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: TableEncryptionV2.awsManagedKey(),
      billing: Billing.onDemand(),
    });

    new AwsCustomResource(this, 'initTable', {
      installLatestAwsSdk: true,
      onCreate: {
        service: 'DynamoDB',
        action: 'batchWriteItem',
        parameters: {
          RequestItems: {
            [this.callCountTable.tableName]: [
              {
                PutRequest: {
                  Item: {
                    pk: { S: 'currentCalls' },
                    calls: { N: '0' },
                  },
                },
              },
            ],
          },
        },

        physicalResourceId: PhysicalResourceId.of(
          this.callCountTable.tableName + '_initialization',
        ),
      },
      onUpdate: {
        service: 'DynamoDB',
        action: 'batchWriteItem',
        parameters: {
          RequestItems: {
            [this.callCountTable.tableName]: [
              {
                PutRequest: {
                  Item: {
                    pk: { S: 'currentCalls' },
                    calls: { N: '0' },
                  },
                },
              },
            ],
          },
        },

        physicalResourceId: PhysicalResourceId.of(
          this.callCountTable.tableName + '_initialization',
        ),
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
  }
}
