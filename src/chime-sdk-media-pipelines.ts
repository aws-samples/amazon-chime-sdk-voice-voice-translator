/* eslint-disable import/no-extraneous-dependencies */
import { KinesisVideoStreamPool } from 'cdk-amazon-chime-resources';
import { Construct } from 'constructs';

export class KinesisVideoStreamPoolResources extends Construct {
  public kinesisVideoStreamPool: KinesisVideoStreamPool;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.kinesisVideoStreamPool = new KinesisVideoStreamPool(
      this,
      'kinesisVideoPoolStream',
      {
        streamConfiguration: {
          dataRetentionInHours: 1,
          region: 'us-east-1',
        },
      },
    );
  }
}
