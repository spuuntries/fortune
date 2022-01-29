require("dotenv").config();
const express = require("express"),
  app = express(),
  procenv = process.env,
  Discord = require("discord.js"),
  client = new Discord.Client({
    intents: ["GUILDS", "GUILD_MEMBERS", "GUILD_MESSAGES"],
  }),
  fs = require("fs"),
  crypto = require("crypto"),
  pkg = require("./package.json"),
  Pagination = require("discord-paginationembed"),
  defaultFortunes = fs.existsSync("./utils/fortunes")
    ? fs
        .readFileSync("./utils/fortunes", "utf8")
        .split("===")
        .map((x) => x.trim().replace(/\n/g, "").replace(/\r/g, ""))
    : [];

// Due to a bit of a weird typing declaration in Enmap, when in production remove the ".default", and vice versa.
const Enmap = require("enmap"),
  db = new Enmap({
    name: "db",
  });

function logger(msg) {
  console.log(`[${new Date()}] ${msg}`);
}

function login() {
  client.login(procenv.TOKEN).catch((err) => {
    logger(`Failed to login!\nErr: ${err}\nRetrying in 5 seconds...`);
    setTimeout(login, 5000);
  });
}

function isHex(h) {
  var a = parseInt(h, 16);
  return a.toString(16) === h.toLowerCase();
}

login();

client.on("ready", () => {
  logger(`${client.user.tag} using ${pkg.name} v${pkg.version} ready!`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot || !message.content.trim().startsWith(procenv.PREFIX))
    return;

  const args = message.content.trim().slice(procenv.PREFIX.length).split(/ +/g),
    command = args.shift().toLowerCase(),
    subcommands = [
      "add",
      "remove",
      "list",
      "clear",
      "shuffle",
      "random",
      "clean",
      "help",
      "info",
    ];

  if (!command == "fortune") return;

  if (!(subcommands.includes(args[0]) && !isHex(args[0]) && args.length > 0))
    return message.reply(`Invalid subcommand!`);

  /** @type {Array<Object>} */
  const fortunes = db.ensure("fortunes", defaultFortunes);

  switch (args[0]) {
    case "add":
      if (!args[1])
        return message.channel.send("You need to provide a fortune!");

      // Generate a unique ID for the fortune.
      let fortuneID = (() => {
        let id;
        do {
          id = crypto.randomBytes(16).toString("hex").slice(0, 8);
        } while (db.filterArray("fortunes", (a) => a.id == id).length > 0);
        return id;
      })();

      // Add the fortune to the database.
      db.push("fortunes", {
        id: fortuneID,
        fortune: message.content.split(args[0])[1],
        opened: false,
      });

      message.reply({
        content: `Added fortune with ID: ${fortuneID}!`,
        allowedMentions: {
          repliedUser: false,
        },
      });

      message.delete();
      break;

    case "remove":
      if (!args[1])
        return message.channel.send("You need to provide a fortune ID!");
      let filtered = db.filterArray("fortunes", (a) => a.id == args[1])[0];

      if (!filtered)
        return message.channel.send("That fortune ID does not exist!");

      db.set(
        "fortunes",
        db.filterArray("fortunes", (a) => a.id != args[1])
      );
      message.reply({
        content: `Removed fortune with ID: ${args[1]}!`,
        allowedMentions: {
          repliedUser: false,
        },
      });
      break;

    case "list":
      if (db.get("fortunes").length == 0)
        return message.channel.send("There are no fortunes!");

      let cookies = db.get("fortunes").map((a) => {
        if (a.opened) return "📜";
        else return "🍪";
      });

      let pages = [],
        rows = [];

      for (let i = 0; i < db.get("fortunes").length; i + 5) {
        rows.push(
          db
            .get("fortunes")
            .slice(i, i + 5)
            .map((a) => `${a.id} : ${a.id}`)
            .join(" ")
        );
      }

      for (let i = 0; i < rows.length; i + 3) {
        let embed = new Discord.MessageEmbed()
          .setTitle("📜 Fortunes")
          .setDescription(
            `Here are all the available fortunes!\n\n${rows
              .slice(i, i + 3)
              .join("\n")}`
          )
          .setColor("#0099ff")
          .setFooter({
            text: `Page ${i / 3 + 1} of ${Math.ceil(rows.length / 3)}`,
          })
          .setTimestamp();

        pages.push(embed);
      }

      new Pagination.Embeds()
        .setArray(pages)
        .setAuthorizedUsers([message.author.id])
        .setChannel(message.channel)
        .setPageIndicator(true)
        .setPage(1)
        .setTimeout(15000)
        .build();
      break;

    case "clear":
      db.set("fortunes", []);
      message.reply({
        content: "Cleared all fortunes!",
        allowedMentions: {
          repliedUser: false,
        },
      });
      break;

    case "shuffle":
      db.set(
        "fortunes",
        (() => {
          // Shuffle the fortunes. This is a bit of a hack, but it works.
          // Credit to https://stackoverflow.com/a/12646864
          let a = db.get("fortunes");
          for (let i = a.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          return a;
        })()
      );

      message.reply({
        content: "Shuffled all fortunes!",
        allowedMentions: {
          repliedUser: false,
        },
      });
      break;

    case "info":
      let fortune = db.filterArray("fortunes", (a) => a.id == args[1])[0];
      message.reply({
        content: `**Fortune ID:** ${fortune.id}\n**Status:** ${
          fortune.opened ? "Opened" : "Closed"
        }`,
        allowedMentions: {
          repliedUser: false,
        },
      });
      break;

    case !args[0] || "random":
      const int = (() => {
        let int;
        do {
          int = crypto.randomInt(1, fortunes.length);
        } while (db.get("fortunes")[int].opened);
        return int;
      })();

      fortune = db.get("fortunes")[int];
      message.author.send(
        `**Here's your fortune!**\n(Fortune ID: ${fortune.id})\n\n${fortune.fortune}`
      );
      break;

    case isHex(args[0]):
      fortune = db.filterArray("fortunes", (a) => a.id == args[0])[0];
      if (!fortune) return message.reply("That fortune ID does not exist!");
      message.reply({
        content: `**Here's your fortune!**\n(Fortune ID: ${fortune.id})\n\n${fortune.fortune}`,
        allowedMentions: {
          repliedUser: false,
        },
      });
      break;

    case "help":
      message.reply({
        content: `**Fortune Help**\n\n**Fortune**\n\n**Fortune add <fortune>** - Adds a fortune to the database.\n**Fortune remove <ID>** - Removes a fortune from the database.\n**Fortune list** - Lists all fortunes.\n**Fortune clear** - Clears all fortunes.\n**Fortune shuffle** - Shuffles all fortunes.\n**Fortune random** - Gets a random fortune.\n**Fortune info <ID>** - Gets information about a fortune.\n**Fortune help** - Shows this help message.\n\n**Fortune**\n\n**Fortune add <fortune>** - Adds a fortune to the database.\n**Fortune remove <ID>** - Removes a fortune from the database.\n**Fortune list** - Lists all fortunes.\n**Fortune clear** - Clears all fortunes.\n**Fortune shuffle** - Shuffles all fortunes.\n**Fortune random** - Gets a random fortune.\n**Fortune info <ID>** - Gets information about a fortune.\n**Fortune help** - Shows this help message.`,
        allowedMentions: {
          repliedUser: false,
        },
      });
      break;
  }
});
