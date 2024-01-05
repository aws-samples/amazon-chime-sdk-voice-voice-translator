import {
  SecurityGroup,
  CfnEIP,
  Peer,
  Port,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export class VPCResources extends Construct {
  public kvsConsumerAlbSecurityGroup: SecurityGroup;
  public clientAlbSecurityGroup: SecurityGroup;
  public serverEip: CfnEIP;
  public voiceSecurityGroup: SecurityGroup;
  public vpc: Vpc;
  public clientApplicationLoadBalancer: ApplicationLoadBalancer;
  public sshSecurityGroup: SecurityGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new Vpc(this, 'VPC', {
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PrivateSubnet',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: SubnetType.PUBLIC,
        },
      ],
      maxAzs: 2,
    });

    this.serverEip = new CfnEIP(this, 'asteriskEip');

    this.kvsConsumerAlbSecurityGroup = new SecurityGroup(
      this,
      'kvsConsumerAlbSecurityGroup',
      {
        vpc: this.vpc,
        description: 'Security Group for KVS Consumer ALB',
      },
    );

    this.clientAlbSecurityGroup = new SecurityGroup(
      this,
      'clientAlbSecurityGroup',
      {
        vpc: this.vpc,
        description: 'Security Group for Asterisk Client ALB',
        allowAllOutbound: true,
      },
    );

    this.clientApplicationLoadBalancer = new ApplicationLoadBalancer(
      this,
      'ApplicationLoadBalancer',
      {
        vpc: this.vpc,
        internetFacing: true,
        securityGroup: this.clientAlbSecurityGroup,
      },
    );

    this.sshSecurityGroup = new SecurityGroup(this, 'SSHSecurityGroup', {
      vpc: this.vpc,
      description: 'Security Group for SSH',
      allowAllOutbound: true,
    });

    this.sshSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22));
    this.sshSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(3000));

    this.voiceSecurityGroup = new SecurityGroup(this, 'AsteriskSecurityGroup', {
      vpc: this.vpc,
      description: 'Security Group for Asterisk Instance',
      allowAllOutbound: true,
    });
    this.voiceSecurityGroup.addIngressRule(
      Peer.ipv4('3.80.16.0/23'),
      Port.udp(5060),
      'Allow Chime Voice Connector Signaling Access',
    );
    this.voiceSecurityGroup.addIngressRule(
      Peer.ipv4('3.80.16.0/23'),
      Port.tcpRange(5060, 5061),
      'Allow Chime Voice Connector Signaling Access',
    );
    this.voiceSecurityGroup.addIngressRule(
      Peer.ipv4('99.77.253.0/24'),
      Port.udp(5060),
      'Allow Chime Voice Connector Signaling Access',
    );
    this.voiceSecurityGroup.addIngressRule(
      Peer.ipv4('99.77.253.0/24'),
      Port.tcpRange(5060, 5061),
      'Allow Chime Voice Connector Signaling Access',
    );
    this.voiceSecurityGroup.addIngressRule(
      Peer.ipv4('99.77.253.0/24'),
      Port.udpRange(5000, 65000),
      'Allow Chime Voice Connector Signaling Access',
    );
    this.voiceSecurityGroup.addIngressRule(
      Peer.ipv4('3.80.16.0/23'),
      Port.udpRange(5000, 65000),
      'Allow Chime Voice Connector Media Access',
    );
    this.voiceSecurityGroup.addIngressRule(
      Peer.ipv4('99.77.253.0/24'),
      Port.udpRange(5000, 65000),
      'Allow Chime Voice Connector Media Access',
    );
    this.voiceSecurityGroup.addIngressRule(
      Peer.ipv4('52.55.62.128/25'),
      Port.udpRange(1024, 65535),
      'Allow Chime Voice Connector Media Access',
    );
    this.voiceSecurityGroup.addIngressRule(
      Peer.ipv4('52.55.63.0/25'),
      Port.udpRange(1024, 65535),
      'Allow Chime Voice Connector Media Access',
    );
    this.voiceSecurityGroup.addIngressRule(
      Peer.ipv4('34.212.95.128/25'),
      Port.udpRange(1024, 65535),
      'Allow Chime Voice Connector Media Access',
    );
    this.voiceSecurityGroup.addIngressRule(
      Peer.ipv4('34.223.21.0/25'),
      Port.udpRange(1024, 65535),
      'Allow Chime Voice Connector Media Access',
    );
  }
}
