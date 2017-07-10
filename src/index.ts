import { AmqpChannelPoolService } from 'island';
import * as Bluebird from 'bluebird';
import { map } from 'bluebird';
import * as amqplib from 'amqplib';
import { range, sum, min, max } from 'lodash';

async function runTest(): Promise<void> {
  const host = process.env.RABBITMQ_HOST;
  if (!host) {
    console.error('env RABBITMQ_HOST is required');
    return;
  }
  const repeat = parseInt(process.env.REPEAT || '1000', 10);
  const concurrency = parseInt(process.env.CONCURRENCY || '100', 10);

  const channelPool = new AmqpChannelPoolService();
  await channelPool.initialize({
    url: process.env.RABBITMQ_HOST
  });

  await mockSetupPush(channelPool);
  const res = await map(range(repeat), async i => {
    return mockSetUpUserPath(channelPool, `BENCH-Q-sid-${i}`, `BENCH-X-pid-${i}`);
  }, {concurrency});
  printStats(res);

  await channelPool.purge();
}

const broadcastExchange = {
  name: 'BENCH-PUSH-FANOUT-EXCHANGE',
  options: {
    durable: true
  },
  type: 'fanout'
};

const playerPushExchange = {
  name: 'BENCH-push.player',
  options: {
    durable: true
  },
  type: 'direct'
};

async function mockSetupPush(channelPool: AmqpChannelPoolService): Promise<void> {
  await channelPool.usingChannel(async channel => {
    await channel.assertExchange(broadcastExchange.name, broadcastExchange.type, broadcastExchange.options);
    await channel.assertExchange(playerPushExchange.name, playerPushExchange.type, playerPushExchange.options);
  });
}

async function mockSetUpUserPath(channelPool: AmqpChannelPoolService, sid: string, aid: string): Promise<any> {
  const PLAYER_EXCHANGE_OPTIONS: any = {
    durable: true,
    autoDelete: true
  };

  const SESSION_Q_OPTIONS: any = {
    durable: true,
    expires: 300000
  };

  let startTime = new Date().getTime();
  const times = {};
  const record = (name?) => {
    const now = (new Date()).getTime();
    if (name) {
      times[name] = now - startTime;
    }
    startTime = now;
  };

  await Bluebird.using(channelPool.getChannelDisposer(), async (channel: amqplib.Channel) => {
    record('openChannel');
    await channel.assertExchange(aid, 'fanout', PLAYER_EXCHANGE_OPTIONS);
    record('assertX');
    await channel.assertQueue(sid, SESSION_Q_OPTIONS);
    record('assertQ');
    await channel.bindQueue(sid, aid, '');
    record('bindQ');
    await channel.bindExchange(aid, playerPushExchange.name, aid);
    record('bindX');
    await channel.bindExchange(aid, broadcastExchange.name, '');
    record('bindX2');
  });

  await Bluebird.using(channelPool.getChannelDisposer(), async (channel: amqplib.Channel) => {
    const testPayload = process.env.PAYLOAD || 'TEST';
    const buffer = new Buffer(JSON.stringify({msg: testPayload}), 'utf8');
    record();
    await channel.publish(playerPushExchange.name, aid, buffer);
    record('publish');
  });

  return times;
}

function printStats(result: any[]): void {
  Object.keys(result[0]).forEach(k => {
    const stats = result.map(o => o[k]);
    const SUM = sum(stats);
    const AVG = SUM / stats.length; 
    const STDDEV = Math.sqrt(sum(stats.map(i => Math.pow(i - AVG, 2))) / stats.length);
    stats.sort();
    const MEDIAN = stats[Math.floor(stats.length / 2)];
    const MIN = min(stats);
    const MAX = max(stats);

    console.log(k);
    console.log({
      SUM,
      AVG,
      STDDEV,
      MEDIAN,
      MIN,
      MAX
    });
  });
}

runTest();
