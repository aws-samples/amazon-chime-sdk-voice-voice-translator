import { Statistic } from '@aws-sdk/client-cloudwatch';
import { Stack, Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  Metric,
  Dashboard,
  Row,
  HorizontalAnnotation,
  GraphWidget,
  GraphWidgetView,
  Stats,
} from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export class CloudWatchResources extends Construct {
  public callsPerTaskMetric: Metric;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const currentCallsMetric = new Metric({
      metricName: 'CallCount',
      namespace: 'AmazonChimeSDKKVSProcessing',
      region: Stack.of(this).region,
      statistic: Statistic.Average,
      period: Duration.minutes(1),
    });

    const currentTasksMetric = new Metric({
      metricName: 'TaskCount',
      namespace: 'AmazonChimeSDKKVSProcessing',
      region: Stack.of(this).region,
      statistic: Statistic.Average,
      period: Duration.minutes(1),
    });

    this.callsPerTaskMetric = new Metric({
      metricName: 'CallsPerTask',
      namespace: 'AmazonChimeSDKKVSProcessing',
      region: Stack.of(this).region,
      statistic: Statistic.Average,
      period: Duration.minutes(1),
    });

    const dashboard = new Dashboard(this, 'TranslatorKVSConsumerDashboard', {
      dashboardName: 'TranslatorKVSConsumerDashboard',
      defaultInterval: Duration.minutes(60),
    });

    dashboard.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const kvsConsumerRow = new Row();

    const scaleInAnnotation: HorizontalAnnotation = {
      label: 'Scale In',
      value: 10,
    };

    const scaleOutAnnotation: HorizontalAnnotation = {
      label: 'Scale Out',
      value: 20,
    };

    const kvsConsumerWidget = new GraphWidget({
      left: [currentCallsMetric, currentTasksMetric, this.callsPerTaskMetric],
      title: 'KVS Consumer Metrics',
      width: 24,
      liveData: true,
      view: GraphWidgetView.TIME_SERIES,
      stacked: false,
      region: Stack.of(this).region,
      leftYAxis: {
        min: 0,
      },
      statistic: Stats.AVERAGE,
      period: Duration.minutes(1),
      leftAnnotations: [scaleInAnnotation, scaleOutAnnotation],
    });

    kvsConsumerRow.addWidget(kvsConsumerWidget);

    dashboard.addWidgets(kvsConsumerRow);
  }
}
