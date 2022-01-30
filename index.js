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
  { Pagination } = require("discordjs-button-embed-pagination"),
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
  if (typeof h !== "string") return false;
  var a = parseInt(h, 16);
  return a.toString(16) === h.toLowerCase();
}

function split(arr, n) {
  let res = [];
  for (let i = 0; i < arr.length; i += n) {
    res.push(arr.slice(i, i + n));
  }
  return res;
}

login();

client.on("ready", () => {
  logger(`${client.user.tag} using ${pkg.name} v${pkg.version} ready!`);
});

client.on("messageCreate", (message) => {
  if (
    message.author.bot ||
    !message.content.toLowerCase().trim().startsWith(procenv.BOTPREFIX)
  )
    return;
  const args = message.content
      .toLowerCase()
      .trim()
      .slice(procenv.BOTPREFIX.length)
      .split(/ +/g),
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
      "unparticipate",
    ];

  if (command != "fortune") return;

  if (args.length > 0) {
    if (!subcommands.includes(args[0]) && !isHex(args[0]))
      return message.reply(`Invalid subcommand!`);
  }

  /** @type {Array<Object>} */
  const fortunes = db.ensure("fortunes", defaultFortunes);
  db.ensure("participated", []);
  let fortune;

  switch (args[0]) {
    case "add":
      if (!args[1])
        return message.channel.send("You need to provide a fortune!");

      // Generate a unique ID for the fortune.
      let fortuneID = (() => {
        let id;
        do {
          id = crypto.randomBytes(16).toString("hex").slice(0, 8);
        } while (db.get("fortunes").filter((a) => a.id == id).length > 0);
        return id;
      })();

      // Add the fortune to the database.
      db.push("fortunes", {
        id: fortuneID,
        fortune: message.content.split(args[0])[1].trim().trimEnd(),
        opened: false,
      });

      message
        .reply({
          content: `Added fortune with ID: ${fortuneID}!`,
          allowedMentions: {
            repliedUser: false,
          },
        })
        .then((msg) => {
          message.delete();
        });
      break;

    case "remove":
      if (!args[1])
        return message.channel.send("You need to provide a fortune ID!");
      let filtered = db.get("fortunes").filter((a) => a.id == args[1])[0];

      if (!filtered)
        return message.channel.send("That fortune ID does not exist!");

      db.set(
        "fortunes",
        db.get("fortunes").filter((a) => a.id != args[1])
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
        else return "📦";
      });

      let pages = [],
        rows = split(
          db.get("fortunes").map((a, i) => `${cookies[i]}||(${a.id})||`),
          3
        ).map((a) => a.join(" "));

      for (let i = 0; i < rows.length; i += 3) {
        let embed = new Discord.MessageEmbed()
          .setTitle("📜 Fortunes")
          .setDescription(
            `Here are all the available fortunes!\n\n${rows
              .slice(i, i + 3)
              .join("\n")}`
          )
          .setColor("#0099ff")
          .setFooter({
            text: `Showing ${i ? i * 3 + 1 : 1}-${
              rows
                .slice(i, i + 3)
                .flat(1)
                .map((e) => e.split(" "))
                .flat(1).length +
              i * 3
            } of ${db.get("fortunes").length} fortunes.`,
          })
          .setTimestamp();

        pages.push(embed);
      }

      new Pagination(message.channel, pages, "Page").paginate();
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
            [a[i], a[j]] = [a[j], a[i]];
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

    case "clean":
      db.set(
        "fortunes",
        db.get("fortunes").filter((a) => !a.opened)
      );
      message.reply({
        content: "Cleaned all closed fortunes!",
        allowedMentions: {
          repliedUser: false,
        },
      });
      break;

    case "info":
      fortune = db.get("fortunes").filter((a) => a.id == args[1])[0];
      message.reply({
        content: `**Fortune ID:** ${fortune.id}\n**Status:** ${
          fortune.opened ? "Opened" : "Closed"
        }`,
        allowedMentions: {
          repliedUser: false,
        },
      });
      break;

    case undefined:
    case "random":
      if (db.get("participated").includes(message.author.id))
        return message.reply(`You've already opened a fortune!`);
      if (db.get("fortunes").length == 0)
        return message.channel.send("There are no fortunes!");
      if (db.get("fortunes").filter((a) => !a.opened).length == 0)
        return message.channel.send("There are no fortunes left!");

      const int = (() => {
        let int;
        do {
          int = crypto.randomInt(0, db.get("fortunes").length);
        } while (db.get("fortunes")[int].opened);
        return int;
      })();

      fortune = db.get("fortunes")[int];
      message.author.send(
        `**Here's your fortune!**\n(Fortune ID: ${fortune.id})\n\n${fortune.fortune}`
      );

      db.set(
        "fortunes",
        db.get("fortunes").map((a) => {
          if (a.id == fortune.id) a.opened = true;
          return a;
        })
      );

      db.push("participated", message.author.id);
      break;

    case "unparticipate":
      if (!args[1])
        return message.channel.send("You need to provide a user ID!");
      let user = message.guild.members.cache.get(args[1]);

      if (!user) return message.channel.send("That user ID does not exist!");
      if (!db.get("participated").includes(user.id))
        return message.channel.send(
          "That user hasn't participated in a fortune!"
        );

      db.set(
        "participated",
        db.get("participated").filter((a) => a != user.id)
      );

      message.reply({
        content: "User removed from participated list!",
        allowedMentions: {
          repliedUser: false,
        },
      });
      break;

    case "help":
      // Generate an embed for it cuz embeds r kooool
      let embed = new Discord.MessageEmbed()
        .setTitle("📚 Fortunes Help 📚")
        .setDescription(
          `Here are all the commands for the Fortune Bot!\n\n**${procenv.BOTPREFIX}fortune add <fortune>** - Adds a fortune to the database.
**${procenv.BOTPREFIX}fortune remove <fortuneID>** - Removes a fortune from the database.
**${procenv.BOTPREFIX}fortune list** - Lists all the fortunes.
**${procenv.BOTPREFIX}fortune clear** - Clears all the fortunes.
**${procenv.BOTPREFIX}fortune shuffle** - Shuffles all the fortunes.
**${procenv.BOTPREFIX}fortune info <fortuneID>** - Shows info about a fortune.
**${procenv.BOTPREFIX}fortune random or ${procenv.BOTPREFIX}fortune** - Opens a random fortune.
**${procenv.BOTPREFIX}fortune unparticipate <userID>** - Removes a user from the \`participated\` list
**${procenv.BOTPREFIX}fortune help** - Shows this help message.`
        )
        .setColor("#CC9902")
        .setFooter({
          text: "Art Union Fortune Box.",
        })
        .setTimestamp();

      message.reply({
        embeds: [embed],
        allowedMentions: {
          repliedUser: false,
        },
      });
      break;

    default:
      if (isHex(args[0])) {
        if (db.get("participated").includes(message.author.id))
          return message.reply(`You've already opened a fortune!`);
        fortune = db.get("fortunes").filter((a) => a.id == args[0])[0];
        if (!fortune) return message.reply("That fortune ID does not exist!");
        if (fortune.opened)
          return message.reply("That fortune has already been opened!");
        message.author.send({
          content: `**Here's your fortune!**\n(Fortune ID: ${fortune.id})\n\n${fortune.fortune}`,
        });

        db.set(
          "fortunes",
          db.get("fortunes").map((a) => {
            if (a.id == fortune.id) a.opened = true;
            return a;
          })
        );
        db.push("participated", message.author.id);
      }
  }
});
