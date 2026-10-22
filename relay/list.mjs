import { listFrames } from "../bridge/relay.mjs";

function parseArgs(argv) {
  const args = { limit: 20 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--channel") {
      args.channel = argv[i + 1];
      i += 1;
    } else if (flag === "--limit") {
      args.limit = Number(argv[i + 1]);
      i += 1;
    } else if (flag === "--help") {
      args.help = true;
    } else {
      throw new Error(`unknown arg ${flag}`);
    }
  }
  return args;
}

function printFrame(frame) {
  const data = frame.data || {};
  console.log(`${frame.channel} ${frame.code} ${frame.ack || ""}`.trimEnd());
  if (data.kind === "tx-summary") {
    console.log(`in_total=${data.in_total}`);
    console.log(`out_total=${data.out_total}`);
    console.log(`count=${data.count}`);
    console.log(`in_count=${data.in_count}`);
    console.log(`out_count=${data.out_count}`);
    console.log(`currency=${data.currency}`);
    console.log(`by_category=${JSON.stringify(data.by_category)}`);
  } else if (data.kind === "snapshot") {
    console.log(`as_of=${data.as_of}`);
    console.log(`account_count=${data.account_count}`);
    console.log(`holdings_count=${data.holdings_count}`);
  } else if (data.kind === "roster") {
    console.log(`name=${data.name}`);
  } else if (data.kind === "daily" || data.kind === "overview") {
    console.log(`title=${data.title}`);
    console.log(`mode=${data.mode}`);
  } else if (data.kind === "holding") {
    console.log(`ticker=${data.ticker_symbol}`);
    console.log(`quantity=${data.quantity}`);
    console.log(`cost_basis=${data.cost_basis}`);
    console.log(`institution_value=${data.institution_value}`);
    console.log(`currency=${data.currency}`);
    console.log(`source=${data.source}`);
  } else if (data.kind === "portfolio-summary") {
    console.log(`source=${data.source}`);
    console.log(`currency=${data.currency}`);
    console.log(`holdings_count=${data.holdings_count}`);
    console.log(`total_value=${data.total_value}`);
    console.log(`cost_basis=${data.cost_basis}`);
    console.log(`unrealised=${data.unrealised}`);
    console.log(`allocation_basis=${data.allocation_basis}`);
    console.log(`allocation_by_ticker=${JSON.stringify(data.allocation_by_ticker)}`);
    console.log(`allocation_by_type=${JSON.stringify(data.allocation_by_type)}`);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("usage: node relay/list.mjs [--channel bots|forex|finance|invest|pulse] [--limit N]");
} else {
  const listed = listFrames(args.channel, args.limit);
  if (listed.ack) {
    console.log(listed.ack);
    process.exitCode = 1;
  } else if (args.channel) {
    console.log(`# ${args.channel} ${listed.frames.length}`);
    for (const frame of listed.frames) printFrame(frame);
  } else {
    for (const channel of listed.channels) {
      const frames = listed.frames[channel];
      console.log(`# ${channel} ${frames.length}`);
      for (const frame of frames) printFrame(frame);
    }
  }
}
