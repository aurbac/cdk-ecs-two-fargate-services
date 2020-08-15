#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkMsgAppBackendStack } from '../lib/cdk-msg-app-backend-stack';

const app = new cdk.App();
new CdkMsgAppBackendStack(app, 'CdkMsgAppBackendStack');
