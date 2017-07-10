import { range } from 'lodash';
import * as amqplib from 'amqplib';
import * as Bluebird from 'bluebird';

const REPEAT = parseInt(process.env.REPEAT, 10) || 1000;
const CONCURRENCY = parseInt(process.env.CONCURRENCY, 10) || 100;
const EXCHANGE = process.env['EXCHANGE'] || 'BENCH-X';
const RABBITMQ_HOST = process.env['RABBITMQ_HOST'] || 'amqp://localhost:5672';
const WORKERS: number = parseInt(process.env['WORKERS'] as string) || 10;

async function consume(num: number): Promise<void> {
  const conn = await amqplib.connect(RABBITMQ_HOST);
  const ch: amqplib.Channel = await conn.createChannel();

  let consumer = async (msg: amqplib.Message) => {
    await Bluebird.delay(10);
    console.log('[x] Received message: ' + msg.content.toString('utf8'));
    ch.ack(msg);
  };

  const q = await ch.assertQueue(`BENCH-Q-sid-${num}`, { durable: true, expires: 300000 });
  await ch.consume(q.queue, consumer, { exclusive: true });
  console.log(`[*] Waiting For Consuming Queue: ${q.queue}`);

  process.once('SIGTERM', async () => {
    await conn.close();
    process.exit(1);
  });
}

Bluebird.map(range(REPEAT), async i => {
  await consume(i);
}, { concurrency: CONCURRENCY });
