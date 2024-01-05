const { awscdk } = require('projen');
const { JobPermission } = require('projen/lib/github/workflows-model');
const { UpgradeDependenciesSchedule } = require('projen/lib/javascript');
const AUTOMATION_TOKEN = 'PROJEN_GITHUB_TOKEN';

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.101.0',
  defaultReleaseBranch: 'main',
  name: 'amazon-chime-sdk-voice-voice-translator',
  appEntrypoint: 'amazon-chime-sdk-voice-voice-translator.ts',
  license: 'MIT-0',
  author: 'Court Schuett',
  copyrightOwner: 'Amazon.com, Inc.',
  authorAddress: 'https://aws.amazon.com',
  devDeps: ['esbuild'],
  projenrcTs: true,
  jest: false,
  deps: [
    'fs-extra',
    'cdk-amazon-chime-resources',
    '@aws-sdk/client-chime-sdk-meetings',
    '@aws-sdk/client-chime-sdk-media-pipelines',
    '@aws-sdk/client-chime-sdk-voice',
    '@aws-sdk/client-lambda',
    '@aws-sdk/client-kinesis-video',
    '@aws-sdk/client-kinesis-video-media',
    '@aws-sdk/client-transcribe-streaming',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-bedrock-runtime',
    '@aws-sdk/client-cloudwatch',
    '@aws-sdk/client-ecs',
    'esbuild',
    '@types/aws-lambda',
    'aws-lambda',
    'fluent-ffmpeg',
    'dotenv',
    'axios',
  ],
  autoApproveOptions: {
    secret: 'GITHUB_TOKEN',
    allowedUsernames: ['schuettc'],
  },
  depsUpgradeOptions: {
    ignoreProjen: false,
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
      schedule: UpgradeDependenciesSchedule.WEEKLY,
    },
  },
  scripts: {
    launch:
      'yarn && yarn projen && yarn build && yarn cdk bootstrap && yarn cdk deploy --require-approval never',
  },
});

const common_exclude = [
  'cdk.out',
  'cdk.context.json',
  'yarn-error.log',
  'dependabot.yml',
  '*.drawio',
  '.DS_Store',
  'dist/',
];

project.gitignore.exclude(...common_exclude);
project.synth();
