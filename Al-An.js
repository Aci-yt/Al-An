#!/usr/bin/env node
//#region imports modules and sets some global variables and functions
//require() will tell node that we need to use these modules from our node_modules folder
const Discord = require("discord.js");
const fs = require("fs");
const sql = require("sqlite");
const jimp = require("jimp");
const moment = require("moment");
const Chance = require("chance");
const chanceobj = new Chance();
//this line tells node that we need the content from our config folder
const config  = require("../Al-An/config.json");
//opening the database
sql.open(`../Al-An/database.sqlite`)

//This will define our bot
var bot = new Discord.Client()

//some variables we'll use often
var botye = "<:complete:490113805594918912>"
var botno = "<:error:490113814650421248>"
var botex = "<:exclm:510129890050179089>"

//some functions used later
var allerrors = (error) => console.log(error)

// --- returns a random number
function randomInt(max){
    return Math.floor(Math.random() * Math.floor(max))+1;
}
function randomintminmax(min, max){
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
// --- returns if a number is odd
function isOdd(num){
    return num %2;
}
// --- returns a number converted to thousands (2456 turns into 2.5k, 2500 turns into 2.5k)
function thousandize(number){
    //ensures the number is positive to avoid math errors
    number = Math.abs(number)
    var SI_SYMBOL = ["", "k", "M", "G", "T", "P", "E"];
    // what tier? (determines SI symbol)
    var tier = Math.log10(number) / 3 | 0;
    // if zero, we don't need a suffix
    if(tier == 0) return number;
    // get suffix and determine scale
    var suffix = SI_SYMBOL[tier];
    var scale = Math.pow(10, tier * 3);
    // scale the number
    var scaled = number / scale;
    // format number and add suffix
    return scaled.toFixed(1) + suffix;
}
// --- capitalizes the first letter of a string and decapitalizes everything else
function capfirst(string){
    return string[0].toUpperCase() + string.slice(1).toLowerCase();
}
// --- returns the current date in ms
function getcurdate(){
    return Math.floor(Date.now()/1000)
}
// --- stops all actions for a specific number of ms
function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
// --- adds a new notification for a specific user in the database
async function newnotif(msg, usr){
    //updates the users notifications
    let time = Date.now()
    await sql.run(`INSERT INTO notifications (userId, time, message) VALUES (?, ?, ?)`, usr, time, msg).catch(allerrors)
    
    //deletes the oldest message if there are 11 or more
    let row = await sql.get(`SELECT COUNT(time) AS num FROM notifications WHERE userId = "${usr}"`).catch(allerrors)
    if(row.num > 5){await sql.run(`DELETE FROM notifications WHERE time = (SELECT MIN(time) FROM notifications WHERE userId = "${usr}") AND userId = "${usr}"`).catch(allerrors)}

    //adds a notification to the profile
    sql.run(`UPDATE users SET mnotif = "1" WHERE userId = "${usr}"`).catch(allerrors)
}
// --- returns the difference in hours between two date objects
function diffh(dt2, dt1) {
    var diff =(dt2.getTime() - dt1.getTime()) / 1000;
    diff /= (60 * 60);
    return Math.abs(Math.round(diff));
}

// --- creates images for all pet bars (hunger, happiness, health)
async function loadpetbars(bar, pet, usr){
    //gets the pet row for values
    let row = await sql.get(`SELECT * FROM pets WHERE owner = "${usr}" AND name = "${pet}" COLLATE NOCASE`)
    if(!row) return
    let maxstat = bar == "food" ? `maxfood` : bar == "happiness" ? `maxhappiness` : `maxhealth` //selects the correct stat
    //gets all required images
    var images = [`../Al-An/assets/bars/pets/background.png`, `../Al-An/assets/bars/pets/${bar}.png`]
    var jimps = []
    for (var i = 0; i < images.length; i++){
        jimps.push(jimp.read(images[i]))
    }
    let path = usr
    let perc = Math.round((row[bar]/row[maxstat])*500)
    if(perc <6) {perc = 7}
    await Promise.all(jimps).then(function(data) {
        return Promise.all(jimps)
    }).then(async function(data){
        //composits the images together
        data[1].resize(perc, 50)
        data[0].composite(data[1], 0, 0)
        //saves the images
        data[0].write(`../Al-An/assets/users/${path}/pet${bar}.png`, function(){})
    })
}

async function xpimg(pet, usr){
    let row = await sql.get(`SELECT * FROM pets WHERE name = "${pet}" AND owner = "${usr}"`) //gets the pet's data
    if(!row) return //if it doesn't find the pet, it doesn't do anything

    var images = [`../Al-An/assets/bars/pets/xp.png`, `../Al-An/assets/bars/pets/xp_mask.png`, `../Al-An/assets/bars/pets/xp_bg.png`] //all images we'll work with
    var jimps = []
    for (var i = 0; i < images.length; i++){
        jimps.push(jimp.read(images[i])) //adds the images to jimp can process them
    }
    //variables to scale the background image to the correct size: 
    let path = usr
    var lvldifxp = Math.pow(10*(row.lvl+1), 2)-Math.pow(10*row.lvl, 2)
    var relxp = row.xp - Math.pow(10*row.lvl, 2)
    var perc = relxp/lvldifxp
    var size = perc*220 + 20
    if(size < 50){size -= 20} //makes it smaller at the start
    else if(size > 200){size += 20} //and bigger at the end
    if(size <= 0){size = 1} //makes sure it doesn't get negative or zero

    await Promise.all(jimps).then(function(data) {
        return Promise.all(jimps)
    }).then(async function(data){
        data[0].flip(false, true)
        data[0].resize(220, size)
        data[0].mask(data[1], 0, 0)
        data[2].composite(data[0], 0, 0)
        data[2].flip(false, true)
        data[2].write(`../Al-An/assets/users/${path}/petxp.png`, function(){})
    })
}
// --- adds a new item to a users inventory
async function newuseritem(amount, name, owner){
    let irow = await sql.get(`SELECT * FROM items WHERE name = "${name}"`)
    if(!irow) return
    sql.get(`SELECT * FROM useritems WHERE owner = "${owner}" AND name = "${name}" COLLATE NOCASE`).then((row) =>{
        if(!row){
        sql.run(`INSERT INTO useritems (name, type, effect, effectval, amount, owner, decaytime, time, value, category, max, useable, sellable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, name, irow.type, irow.effect, irow.effectval, amount, owner, irow.time, getcurdate(), irow.value, irow.category, irow.max, irow.useable, irow.sellable)  
        }
        else{
            sql.run(`UPDATE useritems SET amount = "${row.amount + amount}" WHERE owner = "${owner}" AND name = "${name}" COLLATE NOCASE`)
        }
    }).catch(() =>{
        sql.run(`CREATE TABLE IF NOT EXISTS useritems (name TEXT, type TEXT, effect TEXT, effectval INTEGER, amount INTEGER, owner TEXT, decaytime INTEGER, time INTEGER, value INTEGER, category TEXT, max INTEGER, useable TEXT, sellable INTEGER)`).then(() => {
            sql.run(`INSERT INTO useritems (name, type, effect, effectval, amount, owner, decaytime, time, value, category, max, useable, sellable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, name, irow.type, irow.effect, irow.effectval, amount, owner, irow.time,  getcurdate(), irow.value,irow.category, irow.max, irow.useable, irow.sellable)
        })
    })
}
// --- puts a pet in the "ko-state" to not allow for any modifications until healed
async function kopet(owner, pet){
    let petrow = await sql.get(`SELECT * FROM pets WHERE name = "${pet}" AND owner = "${owner}"`)
    if(!petrow) return
    sql.run(`UPDATE pets SET ko = "1", xp = "${petrow.xp-(petrow.lvl*12+10)}", health = "0" WHERE owner = "${owner}" AND name = "${pet}"`)
    //checks if pet has to level down
    const curlevel = Math.floor(0.1*Math.sqrt(petrow.xp-(petrow.lvl*12+10)))
    if(petrow.lvl > curlevel){
        xplvlchange = `\n-${petrow.lvl*12+10}xp\n${pet} lost ${petrow.lvl-curlevel} level! New level: ${curlevel}`
        sql.run(`UPDATE pets SET lvl = "${curlevel}" WHERE owner = "${user.id}" AND name = "${pet}" COLLATE NOCASE`)
    }
}
// --- adds effects to a pet
async function addeffect(pet, owner, name, type, time, target, strength, isfighteffect){
    //gets the user effects table to check if the effect already exists
    sql.get(`SELECT * FROM usereffects WHERE name = "${name}" AND pet = "${pet}" AND petowner = "${owner}" AND target = "${target}" AND isfighteffect = "${isfighteffect}"`).then(async(row) =>{
        if(!row){   
            //adds a new effect row if the effect doesn't exist already
            await sql.run(`INSERT INTO usereffects (name, type, strength, time, pet, petowner, target, isfighteffect, firstround, createdat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, name, type, strength, time, pet, owner, target, isfighteffect, `true`, getcurdate()).catch(allerrors)
        }
        else{
            //sets the rounds (time) to the maximum if the effect already exists
            sql.run(`UPDATE usereffects SET time = "${time}" WHERE pet = "${pet}" AND petowner = "${owner}"  AND target = "${target}" AND isfighteffect = "${isfighteffect}"`).catch(allerrors)
        }
    }).catch(async() =>{
        //creates the usereffects table and adds a new effect if the table doesn't exist yet
        await sql.run("CREATE TABLE IF NOT EXISTS usereffects (name TEXT, type TEXT, strength INTEGER, time INTEGER, pet TEXT, petowner INTEGER, target TEXT, isfighteffect TEXT, firstround TEXT, createdat INTEGER)").then(async()=>{
            await sql.run(`INSERT INTO usereffects (name, type, strength, time, pet, petowner, target, isfighteffect, firstround, createdat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, name, type, strength, time, pet, owner, target, isfighteffect, `true`, getcurdate()).catch(allerrors)
        })
    })
}// --- checks if a specific cooldown for a specific user exists
async function checkcooldown(name, user){
    //defines a variable row outside of the try statement so it can be changed inside
    var row
    try {
        //gets the row from the database
        var row = await sql.get(`SELECT * FROM usercooldowns WHERE user = "${user}" AND name = "${name}"`)
    } catch(err){console.log(err)}

    //if the user doesn't have a cooldown, return 0
    if(!row || row == undefined){return 0}
    //deletes the cooldown if it's over and returns 0
    else if(row.time <= getcurdate()){
        sql.run(`DELETE FROM usercooldowns WHERE user = "${user}" AND name = "${row.name}"`)
        return 0
    }
    //cooldown exists
    else{
        return -(getcurdate()-row.time) //returns the amount of seconds until it's over
    }
}
// --- adds a new cooldown for a user
function newcooldown(name, duration, user){
    //adds the new cooldown
    sql.get(`SELECT * FROM usercooldowns WHERE user = "${user}" AND name = "${name}"`).then((row) => {
        if(!row){
            sql.run(`INSERT INTO usercooldowns (name, time, user) VALUES (?, ?, ?)`, name, getcurdate()+duration, user)
        }
    }).catch(() => {
        sql.run(`CREATE TABLE IF NOT EXISTS usercooldowns (name TEXT, time INTEGER, user TEXT)`).then(() => {
            sql.run(`INSERT INTO usercooldowns (name, time, user) VALUES (?, ?, ?)`, name, getcurdate()+duration, user)
        })
    })
}
// --- removes a cooldown from a user
function removecooldown(name, user){
    //removes the specified cooldown
    sql.run(`DELETE FROM usercooldowns WHERE user = "${user}" AND name = "${name}"`).catch(allerrors)
}

async function applydamage(petname, owner, amount, cause, torpor){
    //if no torpor amount is specified, default it to 0
    if(!torpor) {torpor = 0}
    //if no cause is defined, add default cause
    if(!cause) {cause = `by taking too much damage`}
    //gets the row of the pet from the database
    let petrow = await sql.get(`SELECT * FROM pets WHERE owner = "${owner}" AND name = "${petname}"`)
    //if no pet is found, return
    if(!petrow || petrow == "") return console.log("No such petrow found!")

    // --- checks what happens after the damage is applied
    if(petrow.health-amount <= 0){//pet dies
        //removes the pet from the database
        sql.run(`DELETE FROM pets WHERE name = "${petname}" AND owner = "${owner}"`).catch(allerrors)
        //notifies the user
        newnotif(`Your pet ${petrow.species} ${petrow.name} died ${cause}!`, owner)
    }
    else{//pet survives
        //variable used to also set the pet's status to "ko", if it's max torpidity is reached
        let knockout = Math.round(petrow.torpidity+torpor) >= petrow.maxtorpidity ? `ko = "1", ` : ``
        //removes the health from the pet and adds torpor (if specified)
        sql.run(`UPDATE pets SET health = "${Math.round(petrow.health-amount)}", ${knockout}torpidity = "${Math.round(petrow.torpidity+torpor)}" WHERE owner = "${owner}" AND name = "${petname}"`).catch(allerrors)
    }
}
//array stores all commands currenty available to users
let allcmds = ["ping", "info", "credits", "support", "bio", "wiki", "profile", "prof", "notifications", "notifs", "daily", "item", "inventory", "inv", "shop", "buy", "background", "backgrounds", "tame", "tames", "pet", "reset", "invite", "version", "cmd", "commands", "help"]

//#endregion

bot.on('error', e => {
  console.log(`Error caught: ${e}`);
})

//on login:
bot.on('ready', async() => {
	//await bot.user.setUsername("ᴀʟ-ᴀɴ").catch(allerrors)
	console.log(`\n-------Connected!-------\n${bot.user.username} online! \nConnected to ${bot.guilds.size} networks and ${bot.users.size} users!\n------------------------`)
    bot.user.setPresence({game: {name: `over ${bot.guilds.size} servers | ${config.prefix2}help`, type: 3}})
    await sql.get(`SELECT * FROM notifications WHERE"`).then(async(row) =>{if(!row) return}).catch(() =>{sql.run("CREATE TABLE IF NOT EXISTS notifications (userId INTEGER, time INTEGER, message TEXT)")})
});

bot.on('message', async message => {
    //if the bot sees a message, it checks all commands, etc. to see if it should do something:

    //variables we'll use often:
    const args = message.cleanContent.slice(config.prefix2.length).trim().split(/ +/g);
    const cmd = args.shift().toLowerCase();
    async function errmsg(msg, time){
        //if no time is specified or invalid, set it to default to 5 seconds
        if(!time || isNaN(time) || time <= 0) {time = 5000}
        //otherwise, multiply the time with 1000 to turn the ms into seconds
        else{time = time*1000}
        //send the message, then remove it after 5 seconds
        message.channel.send(`${botno} ${msg}`).then(async(m) => {await sleep(time); m.delete().catch(allerrors)}).catch(allerrors)
    }
    
    // --- adds xp to a user or a pet
    let xplvlchange = ""
    async function addxp(xp, user, pet){
        if(!pet){
            //gets the user row from the database for stats
            let urow = await sql.get(`SELECT * FROM users WHERE userId = "${user}"`)
            //adds the experience to the user
            sql.run(`UPDATE users SET xp = "${urow.xp + xp}" WHERE userID = "${user}"`)
            //sets the variable to contain the amount of gained xp
            xplvlchange = `\n+${xp} user-xp`

            //levels the user up if possible
            const curlevel = Math.floor(0.1*Math.sqrt(urow.xp+xp))
            if(urow.lvl < curlevel){
                //levels up the user
                sql.run(`UPDATE users SET lvl = "${curlevel}" WHERE userId = "${user}"`)
                //sets the variable to a level up message
                xplvlchange = `+${xp} user-xp\nYou leveled up to level ${curlevel}! `
            }
        }
        else{
            //gets the petrow from the databse for stats
            let petrow = await sql.get(`SELECT * FROM pets WHERE owner = "${user}" AND name = "${pet}" COLLATE NOCASE`)
            //adds the experience to the pet
            sql.run(`UPDATE pets SET xp = "${petrow.xp + xp}" WHERE owner = "${user}" AND name = "${pet}" COLLATE NOCASE`)
            //sets the variable to contain the amount of gained xp
            xplvlchange = `\n+${xp} pet-xp`

            //levels the pet up if possible
            const curlevel = Math.floor(0.1*Math.sqrt(petrow.xp+xp))
            if(petrow.lvl < curlevel){
                //levels up the pet
                sql.run(`UPDATE pets SET lvl = "${curlevel}" WHERE owner = "${user}" AND name = "${pet}" COLLATE NOCASE`)
                //changes the variable to a level up message
                xplvlchange = `\n+${xp} pet-xp\n${pet} leveled up to level ${curlevel}!`
            }
        }
    }

    //user mentions?
    message.mentioned = message.mentions.users.first() || bot.users.find(v=>v.id !== "1" && (message.content.toLowerCase().indexOf(v.username.toLowerCase())  !== -1 || message.content.indexOf(v.id) !== -1 )) || null
    let user = message.mentioned || message.author     

    if(message.author.bot || !message.guild) return //ignores bot messages and pms
    else if(message.guild.id == "180995718461259776" && message.author.id != "180995521622573057" && cmd != "ping") return //ignores acination and for now (except the ping command)

// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ User Profiles ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
//the user table, creates profiles
if(cmd != "edit"){
    //ignores all non-command messages
    if(message.content.indexOf(config.prefix2) !== 0) return;

    //#region Creates / updates user profiles
    await sql.get(`SELECT * FROM users WHERE userId = "${message.author.id}"`).then(async(row) =>{
        if(!row){
            sql.run(`INSERT INTO users (userId, bio, money, crystals, first, clan, col, pets, votes, mnotif, mpms, lvl, xp, xpcol, background, inbattle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, message.author.id, "Your bio here", 0, 0, 0, "None", "", 1, 0, 0, 0, 0, 1, 0, `https://i.imgur.com/uyhDqoO.jpg`, "false")
            sql.run(`INSERT INTO userbackgrounds (category, url, owner) VALUES (?, ?, ?)`, `Abstract`, `https://i.imgur.com/uyhDqoO.jpg`, message.author.id).catch(() =>{
                sql.run("CREATE TABLE IF NOT EXISTS userbackgrounds (url INTEGER, category TEXT, owner INTEGER").then(()=>{
                    sql.run(`INSERT INTO userbackgrounds (category, url, owner) VALUES (?, ?, ?)`, `Abstract`, `https://i.imgur.com/uyhDqoO.jpg`, message.author.id)
                })
            })
        }
        else{
            //only gives xp every 10 seconds
            if(row.xpcol > getcurdate()-10) return
            else{
                var exp = randomInt(5)+5
                //updates the xp and cooldown in the users row
                await sql.run(`UPDATE users SET xp = "${row.xp + exp}" WHERE userId = "${message.author.id}"`).catch(allerrors)
                await sql.run(`UPDATE users SET xpcol = "${getcurdate()}" WHERE userId = "${message.author.id}"`).catch(allerrors)
                const curlevel = Math.floor(0.1*Math.sqrt(row.xp))
                //if the user can level up:
                if(row.lvl < curlevel){
                    //updates the user's level
                    sql.run(`UPDATE users SET lvl = "${curlevel}" WHERE userId = "${message.author.id}"`).catch(allerrors)
                    //sends a levelup message
                    lvlupemb = new Discord.RichEmbed()
                    .setDescription(`Congratulations <@${message.author.id}>, you've reached level **${curlevel}**!`)
                    .setColor(`#00E584`)
                    message.channel.send(lvlupemb).catch(allerrors)
                }
            }
        }
    }).catch(() =>{
        sql.run("CREATE TABLE IF NOT EXISTS users (userId INTEGER, bio TEXT, money INTEGER, crystals INTEGER, first INTEGER, clan TEXT, col TEXT, pets INTEGER, votes INTEGER, mnotif INTEGER, mpms INTEGER, lvl INTEGER, xp INTEGER, xpcol INTEGER, background TEXT, inbattle TEXT)").then(()=>{
            sql.run(`INSERT INTO users (userId, bio, money, crystals, first, clan, col, pets, votes, mnotif, mpms, lvl, xp, xpcol, background, inbattle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, message.author.id, "Your bio here", 0, 0, 0, "None", "", 1, 0, 0, 0, 0, 1, 0, `https://i.imgur.com/uyhDqoO.jpg`, "false")
        })
    })
    //#endregion
}

// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Commands ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

if(message.content.indexOf(config.prefix2) !== 0) return;

//checks if the user exsist in the database and returns if not
let authorrow = await sql.get(`SELECT * FROM users WHERE userId = "${message.author.id}"`).catch(allerrors)
if(!authorrow) return //returns if the user doesn't have a profile yet


//checks the menu cooldown for this user and stops them from using multiple menus at once:
if (await checkcooldown(`spam`, message.author.id) > 0) return errmsg(`Please cool down! (${await checkcooldown(`spam`, message.author.id)}s left)`)
else {await newcooldown(`spam`, 1, message.author.id)}

// --- sends the tutorial for new users and users that request it
//if the user hasn't seen the tutorial yet or uses the tutorial command, send the embed
if(((authorrow.first == 0 && message.guild.id != "180995718461259776") && allcmds.includes(cmd)) || cmd == "tutorial"){
    //checks the menu cooldown for this user and stops them from using multiple menus at once:
    if (await checkcooldown(`menu`, message.author.id) > 0) return errmsg(`You already have an open menu, please close it before opening another one.`)
    else {await newcooldown(`menu`, 120, message.author.id)}

    // --- checks if the user is on cooldown when first using the bot:
    if(await checkcooldown(`tutorial`, message.author.id) > 0) return errmsg(`Please read the complete tutorial first!`)
    else {await newcooldown(`tutorial`, 120, message.author.id)}

    //assigns the message author object to a variable
    usr = message.author
    //variable for the embed page
    i = 0

    //#region all pages of the tutorial
    page0 = new Discord.RichEmbed()
    .setAuthor(`ᴀʟ-ᴀɴ`, )
    .setTitle(`Tutorial [1/9]`)
    .setColor(`#00E584`)
    .setThumbnail(`https://cdn.discordapp.com/attachments/385032155891499008/692073975186063440/acibleh.png`)
    .addField(`Basics`, `This bot focuses on catching wild creatures, leveling them and fighting with them! In the future things like bosses, PvP and base building will be added!`)
    .addField(`Profile`, `You can do \`${config.prefix2}profile\` to view your profile and \`${config.prefix2}reset\` to reset it. You can also do \`${config.prefix2}backgrounds\` to change your profile background!`, false)
    .addField(`Help`, `You can do \`${config.prefix2}help (<command>)\` to view all commands or help for a specific one`, false)
    .addField(`General`, `Do \`${config.prefix2}commands\` to view all other\navailable commands or ${config.prefix2}help <command> to view help for a specific command`, false)
    .setFooter(`Complete the tutorial by reacting with ▶ to start using the bot!`)
    //changes the description based on if the user initiated the tutorial or if it'S the first time they used the bot
    if(authorrow.first == 0){page0.setDescription(`Since this is your first time using the bot, here's a basic overview of how it works:`)}
    else{page0.setDescription(`Here's a basic overview of how this bot works:`)}

    page1 = new Discord.RichEmbed()
    .setAuthor(`ᴀʟ-ᴀɴ`, )
    .setTitle(`Tutorial [2/9]`)
    .setColor(`#00E584`)
    .setThumbnail(`https://cdn.discordapp.com/attachments/385032155891499008/692073975186063440/acibleh.png`)
    .setDescription(`Here's how pets work:`)
    .addField(`Basics`, `You get a pet when first starting out and can acquire new ones by hunting or buying them in the shop!\nMake sure to feed your pet and keep it happy, or it might die or escape!`)
    .addField(`Leveling`, `You can use \`${config.prefix2}pet level\` to train your pet and improve it's abilities and stats by spending experience points!`, false)
    .addField(`Customization`, `You can do \`${config.prefix2}pet name <old_name> <new_name>\` to rename a pet and will soon be able to change a pet's skin, too!`, false)
    .addField(`Classes`, `There are three different classes: Small, Medium and Leviathan. While smaller creatures excel in speed and agility, Leviathans bring huge amounts of health and damage to a fight.\nCreatures can be herbivores, omnivores or carnivores and need to be fed accordingly.`)
    .setFooter(`Complete the tutorial by reacting with ▶ to start using the bot!`)

    page2 = new Discord.RichEmbed()
    .setAuthor(`ᴀʟ-ᴀɴ`, )
    .setTitle(`Tutorial [3/9]`)
    .setColor(`#00E584`)
    .setThumbnail(`https://cdn.discordapp.com/attachments/385032155891499008/692073975186063440/acibleh.png`)
    .setDescription(`Here's how hunting works:`)
    .addField(`Basics`, `You can go hunting with a pet in a specific biome to find resources, encounter other creatures to fight or tame and gain experience for your pet!\nUse \`${config.prefix2}pet hunt <pet_name> <biome>\` to go hunting!`)
    .addField(`Biomes`, `Each biome has a different depth, the deeper the biome the larger the creatures you will encounter. However, the more dangerous a biome is, the better the resources in it are`, false)
    .addField(`Encounters`, `You can encounter creatures while hunting. You can decide to fight to defeat or tame them or try to escape to continue your hunt for resources`, false)
    .addField(`Classes`, `The three classes are bound to specific biome depths. While small creatures only exist in shallow or medium-depth biomes, levithans only in medium and large depth-biomes, medium creatures exist in all three.`)
    .setFooter(`Complete the tutorial by reacting with ▶ to start using the bot!`)

    page3 = new Discord.RichEmbed()
    .setAuthor(`ᴀʟ-ᴀɴ`, )
    .setTitle(`Tutorial [4/9]`)
    .setColor(`#00E584`)
    .setThumbnail(`https://cdn.discordapp.com/attachments/385032155891499008/692073975186063440/acibleh.png`)
    .setDescription(`Here's how fighting and taming works:`)
    .addField(`Basics`, `When encountering a creature and choosing to fight, you will be taken into turn based combat. At the end either of the creatures will be killed or knocked out. If you knock out your enemy, you can tame them.`)
    .addField(`Fight rules`, `All actions except resting consume stamina. Your pet can attack normally to deal basic damage and torpor, rest to heal itself and regenerate stamina or try to escape. Your goal is to kill or knock out your enemy`, false)
    .addField(`Abilities`, `It can also use one of up to three abilities per round, each with their own costs and advantages. Your enemy can also have and use abilities. The higher their level, the more likely they are to have special abilities.`, false)
    .addField(`Taming`, `Once you knock out the enemy, you can choose to kill or tame them, if you have their preferred food. By taming them they will join your ranks as your pet`)
    .setFooter(`Complete the tutorial by reacting with ▶ to start using the bot!`)

    page4 = new Discord.RichEmbed()
    .setAuthor(`ᴀʟ-ᴀɴ`, )
    .setTitle(`Tutorial [5/9]`)
    .setColor(`#00E584`)
    .setImage(`https://i.imgur.com/fl32U8K.jpg`)
    .setDescription(`This is an example profile! Here's what each part means:\n\n\`[1]\`| Your pet's level. The background will fill up more, the closer it is to leveling up.\n\`[2]\`| Your pet's class\n\`[3]\`| Your pet's diet\n\`[4]\`| Your pet's health\n\`[5]\`| Your pet's food\n\`[6]\`| Your pet's happiness\n\`[7]\`| Your pet's strength\n\`[8]\`| Your pet's shields\n\`[9]\`| Your pet's torpidity\n\`[10]\`| Your pet's stamina`)
    .setFooter(`You can access this tutorial anytime again by using ${config.prefix2}tutorial!`)

    page5 = new Discord.RichEmbed()
    .setAuthor(`ᴀʟ-ᴀɴ`, )
    .setTitle(`Tutorial [6/9]`)
    .setColor(`#00E584`)
    .setImage(`https://i.imgur.com/GYVcON9.jpg`)
    .setDescription(`This a user profile! Here's what each part means:\n\n\`[1]\`| Your bio\n\`[2]\`| Your credits amount\n\`[3]\`| Your crystal amount\n\`[4]\`| Your pet amount\n\`[5]\`| Your level\n\`[6]\`| Your current level\n\`[7]\`| Your XP amount\n\`[8]\`| The next level`)
    .setFooter(`You can access this tutorial anytime again by using ${config.prefix2}tutorial!`)

    page6 = new Discord.RichEmbed()
    .setAuthor(`ᴀʟ-ᴀɴ`, )
    .setTitle(`Tutorial [7/9]`)
    .setColor(`#00E584`)
    .setImage(`https://i.imgur.com/nLfAyS9.jpg`)
    .setDescription(`This is an example wiki page! Here's what each part means:\n\n\`[1]\`| The creatures health\n\`[2]\`| The creatures shields\n\`[3]\`| The creatures strength\n\`[4]\`| The creatures stamina\n\`[5]\`| The creatures food\n\`[6]\`| The creatures torpidity\n\`[7]\`| The creatures drops\n\`[8]\`| The creatures additional information\n\n\`[A]\`| Base stats\n\`[B]\`| Increasement per creature level\n\`[C]\`| Changes per hour\n\`[D]\`| Torpidity damage per attack`)
    .setFooter(`You can access this tutorial anytime again by using ${config.prefix2}tutorial!`)

    page7 = new Discord.RichEmbed()
    .setAuthor(`ᴀʟ-ᴀɴ`, )
    .setTitle(`Tutorial [8/9]`)
    .setColor(`#00E584`)
    .setImage(`https://i.imgur.com/UEuIA0G.jpg`)
    .setDescription(`This is an example ability page! Here's what each part means:\n\n\`[1]\`| The selected ability (icon)\n\`[2]\`| The ability level (out of 10). The bar will will up the more you level the ability.\n\`[3]\`| The ability type\n\`[4]\`| The effect the ability causes\n\`[5]\`| The effect duration\n\`[6]\`| The abilities stamina requirement\n\`[7]\`| The abilities description\n\`[A]\`| Strength vs. small creatures\n\`[B]\`| Strength vs. medium creatures\n\`[C]\`| Strength vs. leviathans`)
    .setFooter(`You can access this tutorial anytime again by using ${config.prefix2}tutorial!`)

    page8 = new Discord.RichEmbed()
    .setAuthor(`ᴀʟ-ᴀɴ`, )
    .setTitle(`Tutorial [9/9]`)
    .setColor(`#00E584`)
    .setImage(`https://i.imgur.com/ULXuBZR.jpg`)
    .setDescription(`This is an leveling menu:\n\n\`[A]\`| Current stats\n\`[B]\`| Stat change if leveled up\n\`[C]\`| Final stat if leveled up`)
    .setFooter(`You can access this tutorial anytime again by using ${config.prefix2}tutorial!`)

    page9 = new Discord.RichEmbed()
    .setAuthor(`ᴀʟ-ᴀɴ`, )
    .setTitle(`Tutorial complete!`)
    .setColor(`#00E584`)
    .setThumbnail(`https://cdn.discordapp.com/attachments/385032155891499008/692073975186063440/acibleh.png`)
    .setDescription(`You're now ready to start your adventure!\nHave fun and good hunting!`)
    .addField(`Credits:`, `• Belial (Art assets (Pets))\n• Planarian#0492 (Art assets (Alterra Hologram))\n• LiftsHerTail#0001 (Coding help)\n• OfficialNoob (Maths support)`)
    .setFooter(`You can access this tutorial anytime again by using ${config.prefix2}tutorial!`)
    //#endregion

    msg = await message.channel.send(page0).catch(allerrors)
    await msg.react(`◀`).catch(allerrors)
    await msg.react(`▶`).catch(allerrors)
    if(authorrow.first != 0) await msg.react(`🚫`).catch(allerrors)

    //method for getting the right page
    let getpage = (i) => {
        const source = {
            0: page0,
            1: page1,
            2: page2,
            3: page3,
            4: page4,
            5: page5,
            6: page6,
            7: page7,
            8: page8,
            9: page9
        }
        return source[i]
    }

    //checks for reactions
    const filter = (reaction, user) => !user.bot && user.id ==usr.id;
    let collector = msg.createReactionCollector(filter, { time: 100000 });
    //opens the reaction collector
    collector.on('collect', async (reaction, collector) => {
        //checks which reaction was given
		const chosen = reaction.emoji.name;
		if(chosen == "◀"){
            //removes the user's reaction
            msg.reactions.get("◀").remove(message.author.id).catch(allerrors)
            i = i-1
            if(i<0){i = 0}
            //updates the embed with the correct page
            msg.edit(getpage(i)).catch(allerrors)
        }
        else if (chosen == "▶"){
            //removes the user's reaction
            msg.reactions.get("▶").remove(message.author.id).catch(allerrors)
            i = i+1
            if(getpage(i)==undefined){i = i-1}
            //updates the embed with the correct page
            msg.edit(getpage(i)).catch(allerrors)
            //stops the collector if the last page was reached
            if(i == 9 && authorrow.first == 0){
                //updates the database to acknowlege the completed tutorial
                sql.run(`UPDATE users SET first = "1" WHERE userId = "${message.author.id}"`).catch(allerrors)
                //stops the reaction collector
                collector.stop();
                //clears the reactions from the message
                msg.clearReactions().catch(allerrors)
            }
        }
        else if (chosen == "🚫" && authorrow.first != 0){
            //only check for stop reactions if the user opened the tutorial themselves
            //stops the reaction collector
            collector.stop();
            //deletes the tutorial message
            msg.delete().catch(allerrors)
        }
    });
    //removes reactions in case of timeout and resets the users cooldown
	collector.on('end', collected => {
        //removes the reactions
        msg.clearReactions().catch(allerrors)
        //removes the tutorial and menu cooldown
        removecooldown(`tutorial`, message.author.id)
        removecooldown(`menu`, message.author.id)
    });
}

else if (cmd == "ping") {
    message.channel.send('Ping?').then(m => m.edit(`Pong! Network latency is ${m.createdTimestamp-message.createdTimestamp >= 1000 ? Math.round((m.createdTimestamp-message.createdTimestamp)/100)/10 + `s` : m.createdTimestamp-message.createdTimestamp + `ms`}. Fallback network latency is ${Math.round(bot.ping)}ms`)).catch(allerrors)
}

else if (cmd == "info" || cmd == "credits" || cmd == "support"){
    message.channel.send(`\`\`\`asciidoc
== Al-An ==

Let a Precursor Ai guide you through the depths of an ocean planet, build your own bases or fight with and against alien creatures!

== Basic Info ==

${config.prefix2}cmds   :: Shows all commands
${config.prefix2}help   :: Shows the help menu
${config.prefix2}invite :: Invites Al-An to your server

Support server :: https://discord.gg/HpwxAnT

Developed by Aci#0123
Inspired by Subnautica (Unknown Worlds Entertainment)

== Special thanks to ==

Belial              :: Art assets (Pets)

Planarian#0492      :: Art assets (Alterra Hologram)

LiftsHerTail#0001   :: Coding help

OfficialNoob        :: Maths support
\`\`\``)
}

else if (cmd == "bio") {
    let bio = args.slice(0).join(" ")
    let maxlength = 85
    if(!args[0]) return message.channel.send(botno+`You didn't specify a bio!`).catch(allerrors)
    else if(bio.length>maxlength) return message.channel.send(botno+`Please set a shorter bio! You were ${bio.length-maxlength} character${bio.length-maxlength == 1 ? `` : `s`} over the limit.`).catch(allerrors)
    else if (bio.length<5) return message.channel.send(botno+`Please use a longer bio. Minimum length: 5 characters`).catch(allerrors)
    sql.run(`UPDATE users SET bio = ? WHERE userId = "${message.author.id}"`, `${bio}`).catch(allerrors) //using ? to prevent sql injections
    message.channel.send(botye+`I updated your bio to:\n\`${bio}\``).catch(allerrors)
}

else if (cmd == "create"){
    if(message.author.id != "180995521622573057") return
    crembed = new Discord.RichEmbed()
    .setTitle("New species:")
    .addField(`Species: `, `${args[0]}\n⁣`)
    .addField(`Basic health: `, args[1] + ` (+ ${args[2]}/h)\n⁣`, true)
    .addField(`Health increasement: `, args[3] + "\n⁣", true)
    .addField(`Basic shields: `, args[4] + "\n⁣", true)
    .addField(`Shield increasement: `, args[5] + "\n⁣", true)
    .addField(`Basic strength: `, args[6] + "\n⁣", true)
    .addField(`Strength increasement: `, args[7] + "\n⁣", true)
    .addField(`Basic stamina: `, args[8] + ` (+ ${args[9]}/h)\n⁣`, true)
    .addField(`Stamina increasement: `, args[10] + "\n⁣", true)
    .addField(`Skin `, args[11] + "\n⁣", true)
    .addField(`Rarity: `, args[12] + "\n⁣", true)
    .addField(`Tameable: `, args[13] + "\n⁣", true)
    .addField(`Maxfood: `, args[14] + ` (-${args[15]}/h)\n⁣`, true)
    .addField(`Food consumption: `, args[16] + "/h\n⁣", true)
    .addField(`Class: `, args[17] + "\n⁣", true)
    .addField(`Diet: `, args[18] + "\n⁣", true)
    .addField(`Maxtorpidity: `, args[21] + ` (- ${args[22]} torpidity/h)\n⁣`, true)
    .addField(`Maxtorpidity increasement: `, args[23] + "\n⁣", true)
    .addField(`Torpidity damage: `, args[24] + "\n⁣", true)
    .addField(`Taming requirement: `, args[25], true)
    .addField(`Taming food consumption: `, args[26], true)
    .setThumbnail(args[19], true)
    .setColor(args[20])
    .setDescription("*"+ args.slice(27).join(" ") + "*\n⁣")
    //The creature table
    sql.get(`SELECT * FROM creatures WHERE species = "${args[0]}"`).then((row) =>{
        if(!row){
            sql.run(`INSERT INTO creatures (species, health, healthregen, maxhealthinc, shields, maxshieldsinc, attack, maxattackinc, stamina, staminaregen, maxstaminainc, skin, chance, tameable, maxfood, maxfoodinc, foodreq, class, diet, pic, col, maxtorpidity, torpidityloss, maxtorpidityinc, torpiditydmg, tamereq, tamefoodreq, updated, desc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24], args[25], args[26], 0, args.slice(27).join(" "))
            message.channel.send(crembed)
        }
    }).catch(() =>{
        sql.run("CREATE TABLE IF NOT EXISTS creatures (species TEXT, health INTEGER, healthregen INTEGER, maxhealthinc INTEGER, shields INTEGER, maxshieldsinc INTEGER, attack INTEGER, maxattackinc INTEGER, stamina INTEGER, staminaregen INTEGER, maxstaminainc INTEGER, skin TEXT, chance INTEGER, tameable INTEGRER, maxfood INTEGER, maxfoodinc INTEGER, foodreq INTEGER, class TEXT, diet TEXT, pic TEXT, col TEXT, maxtorpidity INTEGER, torpidityloss INTEGER, maxtorpidityinc INTEGER, torpiditydmg INTEGER, tamereq INTEGER, tamefoodreq INTEGER, updated INTEGER, desc TEXT)").then(()=>{
            sql.run(`INSERT INTO creatures (species, health, healthregen, maxhealthinc, shields, maxshieldsinc, attack, maxattackinc, stamina, staminaregen, maxstaminainc, skin, chance, tameable, maxfood, maxfoodinc, foodreq, class, diet, pic, col, maxtorpidity, torpidityloss, maxtorpidityinc, torpiditydmg, tamereq, tamefoodreq, updated, desc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24], args[25], args[26], 0, args.slice(27).join(" "))
            message.channel.send(crembed)
        })
    })
}

else if (cmd == "edit"){
    if(message.author.id != "180995521622573057") return
    else if(!args[0]) return message.channel.send(botno + " Which table?")
    else if(!args[1]) return message.channel.send(`${botno} What row in table ${args[0]}?`)
    else if(args[1] == "delete"){
        sql.run(`DROP TABLE ${args[0]}`).catch((error) => message.channel.send(`${botno} Error: \`${error}\``)).catch(allerrors)
        message.channel.send(`${botye} Deleting \`${args[0]}\`...`)
    }
    else if(!args[2]) return message.channel.send(`${botno} What's \`${args[1]}\` supposed to be?`)
    else if(!args[3]) return message.channel.send(`${botno} What do you want to change in \`${args[0]}>${args[1]}\``)
    else if(args[3] == "delete"){
        sql.run(`DELETE FROM ${args[0]} WHERE ${args[1]} = "${args[2]}"`).catch((error) => message.channel.send(`${botno} Error: \`${error}\``)).catch(allerrors)
        message.channel.send(`${botye} Deleting **${args[2]}** in \`${args[0]}>${args[1]}\`...`)
    }
    else if(!args[4]) return message.channel.send(`${botno} What do you want to change \`${args[3]}\` to?`)
    else{
        sql.run(`UPDATE ${args[0]} SET ${args[3]} = "${args.slice(4).join(" ")}" WHERE ${args[1]} = "${args[2]}"`).catch((error) => message.channel.send(`${botno} Error: \`${error}\``)).catch(allerrors)
        message.channel.send(`${botye} Updating ${args[2]}'s **${args[3]}** in ${args[0]}>${args[1]} to\n\`${args.slice(4).join(" ")}\``).catch(allerrors)
    }
}

else if (cmd == "wiki"){
    //checks if the user can use this command right now
    if(await checkcooldown(`wiki`, message.author.id) > 0) return message.channel.send(botex+`Please wait **${await checkcooldown(`wiki`, message.author.id)}s** before using this command!`).then(async(msg) => {await sleep(4000); msg.delete()}).catch(allerrors)

    if(!args[0]) return message.channel.send(`${botno} Which creature to you want to look up?`).catch(allerrors)
    else if(args[0].toLowerCase() == "list"){//user wants to list all entries
        //if the user doesn't specify wether to list creatures or items, send an error message
        if(!args[1] || (args[1]!="creatures"&&args[1]!="items")) return errmsg(`Do you want to look up creatures or items?`)
        //adds a new cooldown for the user
        else if(await checkcooldown(`wiki`, message.author.id) <= 0){await newcooldown(`wiki`, 5, message.author.id)}
        //function for "cleaning" the user input to prevent sql injections:
        function scrub(txt){
            return txt.replace(/[^a-zA-Z ]/g, "")
        }
        //variable to store the names in
        let namesstr = ""
        //gets the correct rows from the database
        let allrows = await sql.all(`SELECT * FROM ${scrub(args[1])}`)
        for(i in allrows){
            if(Object.keys(allrows[i])[0] == "name"){namesstr += `• ${allrows[i].name}\n`}
            else{namesstr += `• ${allrows[i].species}\n`}
        }
        message.channel.send(`Here are all entries in the **${args[1].toLowerCase()}** category:\n\n${namesstr == "" ? "None!" : namesstr}`).catch(allerrors)
    }
    else if(args[0].length < 4) return message.channel.send(`${botno} Please provide at least 4 letters to search for a creature.`).catch(allerrors)
    else{
        //adds a new cooldown for the user
        if(await checkcooldown(`wiki`, message.author.id) <= 0){await newcooldown(`wiki`, 5, message.author.id)}
        //variable to determine which wiki category to use
        let category = "creatures"
        let row = await sql.get(`SELECT * FROM creatures WHERE species LIKE ? COLLATE NOCASE`, `${args[0].toLowerCase()}%`)
        if(!row){category = "items"}

        if(category == "creatures"){
            //variable to store the path to the creature image in
            let imgpath = `../Al-An/assets/wiki/creatures/${row.species}.jpg`
            if(!fs.existsSync(imgpath)){imgpath = `../Al-An/assets/wiki/creatures/empty.jpg`}

            //sets the bots status to typing, so the user knows the command worked
            message.channel.startTyping()
            if(row.updated != 0 || !fs.existsSync(`../Al-An/assets/wiki/complete/${row.species.toLowerCase()}wiki.jpg`)){ //only updates the image if something was changed to make it quicker
                var images = ["../Al-An/assets/wiki/wiki_bg.jpg", "../Al-An/assets/wiki/wiki_bg.png", imgpath, `../Al-An/assets/wiki/wiki_overlay.png`, `../Al-An/assets/menus/menuimgs/${row.diet}.png`, `../Al-An/assets/wiki/Hexagon.png`]
                var jimps = []
                //gets all drops for the species from the database
                let droprows = await sql.all(`SELECT * FROM drops WHERE creature = "${row.species}"`).catch(allerrors)
                //adds icons for all drops to the images array
                if(droprows != undefined && droprows != ""){
                    for(i in droprows){
                        if (!fs.existsSync(`../Al-An/assets/wiki/items/!${droprows[i].name}_transparent.png`)){
                            images.push(`../Al-An/assets/wiki/items/!Empty_transparent.png`)
                        }
                        else{images.push(`../Al-An/assets/wiki/items/!${droprows[i].name}_transparent.png`)}
                    }
                }
                for (var i = 0; i < images.length; i++){
                    jimps.push(jimp.read(images[i]))
                }
                await Promise.all(jimps).then(function(data) {
                    return Promise.all(jimps)
                }).then(async function(data){
                    //variable to store the x-coordinates for the drop icon
                    let dropx = 175
                    data[2].resize(588, 296) //resizes the databank entry
                    data[4].resize(80, 80) //resizes the food icon
                    data[0].composite(data[2], 130, 26) //adds the databank entry
                    data[0].composite(data[1], 0, 0) //adds the background overlay so the entry is only viisble in one window
                    data[0].composite(data[3], 0, 0) //adds the overlay
                    data[0].composite(data[4], 60, 970) //adds the food icon

                    //adds all drop icons
                    for(i=6; i<=images.length; i++){
                        //adds the drops as long as there are any left to add
                        if(data[i] != undefined){
                            data[0].composite(data[5], dropx, 1235) //adds the drop background
                            data[0].composite(data[i], dropx+25, 1245) //adds the drop icon
                            dropx += 175
                        }
                    }
                    await jimp.loadFont(`../Al-An/assets/fonts/unisans_80.fnt`).then(async wikifont => {
                        //loads one different (smaller) font:
                        var wikifont_m = await jimp.loadFont(`../Al-An/assets/fonts/unisans_75.fnt`)
                        //loads another different (smallest) font:
                        var wikifont_s = await jimp.loadFont(`../Al-An/assets/fonts/unisans_65.fnt`)
                        //function to determine the correct font
                        function rightfont(num){return num < 1000 ? wikifont : wikifont_m}
                        // --- prints all the values and text on the image:
                        data[0].print(wikifont_m, 750, 85, {text:  `Class: ${row.class}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                                                //health stat:
                        data[0].print(wikifont, 200, 375, {text:  `${thousandize(row.health)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(wikifont, 675, 375, {text: `+${thousandize(row.maxhealthinc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(rightfont(row.healthregen), 890, 335, {text: `+${thousandize(row.healthregen)}/h`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                        //shields stat:
                        data[0].print(wikifont, 200, 525, {text:  `${thousandize(row.shields)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(wikifont, 675, 525, {text: `+${thousandize(row.maxshieldsinc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        //strength stat: (+ torpidity damage stat)
                        data[0].print(wikifont, 200, 670, {text:  `${thousandize(row.attack)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(wikifont, 675, 670, {text: `+${thousandize(row.maxattackinc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(rightfont(row.torpiditydmg), 990,630, {text:  `${thousandize(row.torpiditydmg)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                        //stamina stat:
                        data[0].print(wikifont, 200, 815, {text:  `${thousandize(row.stamina)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(wikifont, 675, 818, {text: `+${thousandize(row.maxstaminainc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(rightfont(row.staminaregen), 890, 786, {text: `+${thousandize(row.staminaregen)}/h`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                        //food stat:
                        data[0].print(wikifont, 200, 965, {text:  `${thousandize(row.maxfood)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(wikifont, 675, 965, {text: `+${thousandize(row.maxfoodinc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(rightfont(row.foodreq), 890, 932, {text:`-${thousandize(row.foodreq)}/h`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                        //torpidity stat:
                        data[0].print(wikifont, 200, 1112, {text:  `${thousandize(row.maxtorpidity)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(wikifont, 675, 1112, {text: `+${thousandize(row.maxtorpidityinc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(wikifont_m,890,1080,{text:`-${thousandize(row.torpidityloss)}/h`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                        // --- description
                        //splits the description into multiple strings, each in their own line so they don't go out of the frame
                        let desccoord = 1410 
                        let desc = row.desc.replace(/ /g, `﻿`) //replaces spaces with an invisible character because jimp creates a new line for every normal space
                        //changes the font if the description is too long, three possible sizes
                        let descfont = desc.length > 140 ? wikifont_s : desc.length > 110 ? wikifont_m : wikifont
                        //splits the string every 20/30/40 characters (depending on font size) or at a space closest to them
                        let descparts = descfont == wikifont ? desc.match(/.{1,20}(\s|$)/g) : descfont == wikifont_m ? desc.match(/.{1,22}(\s|$)/g) : desc.match(/.{1,25}(\s|$)/g)
                        //cycles through each part and adds it to the image, each one a little lower than the previous one
                        for(i = 0; i < descparts.length; i++){
                            data[0].print(descfont, 200, desccoord, {text: `${descparts[i]}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                            //if the font is large, have a larger space in between lines than for a smaller font:
                            switch(descfont){
                                case wikifont   : {desccoord += 80; break}
                                case wikifont_m : {desccoord += 65; break}
                                default         : {desccoord += 50; break}
                            }
                        }
                    })
                    data[0].write(`../Al-An/assets/wiki/complete/${row.species.toLowerCase()}wiki.jpg`, function(){})
                })
                //changes the updated stat to 0 so next time it doesn't update the image again (used if values or pictures change to update the wiki)
                sql.run(`UPDATE creatures SET updated = "0" WHERE species = "${row.species}"`).catch(allerrors)
            }
            //resets the bots typing status
            message.channel.stopTyping()

            wikiembed = new Discord.RichEmbed()
            .setColor(row.col)
            .setTitle(`Wiki: ${row.species}`)
            .setDescription(row.desc)
            .attachFile(`../Al-An/assets/wiki/complete/${row.species.toLowerCase()}wiki.jpg`)
            .setImage(`attachment://${row.species.toLowerCase()}wiki.jpg`)
            message.channel.send(wikiembed).catch(allerrors)
        }
        else if(category == "items"){
            //gets the item row
            let row = await sql.get(`SELECT * FROM items WHERE name LIKE ? COLLATE NOCASE`, `${args[0].toLowerCase()}%`)
            //if no item is found, send an error message
            if(!row) return errmsg(`There's no such creature or item!`)
            //variable to store the path to the item image in
            let imgpath = `../Al-An/assets/wiki/items/${row.name.toLowerCase()}.png`
            //if the file with the item image doesn't exist, use a generic one
            if(!fs.existsSync(imgpath)){imgpath = `../Al-An/assets/wiki/items/empty.png`}
            //create a new embed to send
            wikiembed = new Discord.RichEmbed()
            .setColor(`#f7faf8`)
            .setTitle(`Wiki: ${row.name}`)
            .setDescription(row.desc)
            .attachFile(imgpath)
            .setThumbnail(imgpath == `../Al-An/assets/wiki/items/empty.png` ? `attachment://empty.png` : `attachment://${row.name.toLowerCase()}.png`)
            message.channel.send(wikiembed).catch(allerrors)
        }
    }   
}

else if (cmd == "prof" || cmd == "profile"){
    //checks if the user can use this command right now
    if(await checkcooldown(`prof`, message.author.id) > 0) return message.channel.send(botex+`Please wait **${await checkcooldown(`prof`, message.author.id)}s** before using this command!`).then(async(msg) => {await sleep(4000); msg.delete()}).catch(allerrors)
    else {await newcooldown(`prof`, 15, message.author.id)}

    sql.get(`SELECT * FROM users WHERE userId = ?`, user.id).then(async(row) => {
        if(!row) return message.channel.send(`${botno} Generated your profile. Please try again`)

        //sets the bots status to typing, so the user knows the command worked
        message.channel.startTyping()

        //function for adding a pet to the user when first viewing their profile
        async function firstprof(){
            if(row.first != "1") return
            //determines which pet a user gets when first checking their profile
            let petvar = randomInt(100)
            let pettype = petvar < 80 ? "Peeper" : "Rabbitray"
            //the pet table
            sql.get(`SELECT * FROM pets WHERE owner = ?`, user.id).then((row) =>{
                if(!row){
                    //gets the stats from the creature table, then uses them to create the pet row
                    sql.get(`SELECT * FROM creatures WHERE species = "${pettype}"`).then((row) => {
                        sql.run(`INSERT INTO pets (species, name, owner, health, maxhealth, healthtime, shields, attack, stamina, maxstamina, happiness, maxhappiness, happinesstime, torpidity, maxtorpidity, torpiditytime, torpiditydmg, skin, chance, pic, xp, lvl, stamtime, passive, passiveval, food, maxfood, foodtime, class, ko, points, inbattle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, pettype, pettype, message.author.id, row.health, row.health, getcurdate(), row.shields, row.attack, row.stamina, row.stamina, 100, 100, getcurdate(), 0, row.maxtorpidity, getcurdate(), row.torpiditydmg, row.skin, row.chance, row.pic, "1", "0", getcurdate(), "None", 1, row.maxfood, row.maxfood, getcurdate(), row.class, 0, 0, 0)
                    })
                }
            }).catch(() =>{
                sql.run("CREATE TABLE IF NOT EXISTS pets (species TEXT, name TEXT, owner TEXT, health INTEGER, maxhealth INTEGER, healthtime INTEGER, shields INTEGER, attack INTEGER, stamina INTEGER, maxstamina INTEGER, happiness INTEGER, maxhappiness INTEGER, happinesstime INTEGER, torpidity INTEGER, maxtorpidity INTEGER, torpiditytime INTEGER, torpiditydmg INTEGER, skin INTEGER, chance INTEGER, pic TEXT, xp INTEGER, lvl INTEGER, stamtime INTEGER, passive TEXT, passiveval INTEGER, food INTEGER, maxfood INTEGER, foodtime INTEGER, class TEXT, ko INTEGER, points INTEGER, inbattle INTEGER)").then(()=>{
                    //gets the stats from the creature table, then uses them to create the pet table & row
                    sql.get(`SELECT * FROM creatures WHERE species = "${pettype}"`).then((row) => {
                        sql.run(`INSERT INTO pets (species, name, owner, health, maxhealth, healthtime, shields, attack, stamina, maxstamina, happiness, maxhappiness, happinesstime, torpidity, maxtorpidity, torpiditytime, torpiditydmg, skin, chance, pic, xp, lvl, stamtime, passive, passiveval, food, maxfood, foodtime, class, ko, points, inbattle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, pettype, pettype, message.author.id, row.health, row.health, getcurdate(), row.shields, row.attack, row.stamina, row.stamina, 100, 100, getcurdate(), 0, row.maxtorpidity, getcurdate(), row.torpiditydmg, row.skin, row.chance, row.pic, "1", "0", getcurdate(), "None", 1, row.maxfood, row.maxfood, getcurdate(), row.class, 0, 0, 0)
                    })
                })
            })
            sql.run(`UPDATE users SET first = "2" WHERE userId = ?`, user.id).catch(allerrors)
        }

        //checks if the user checks their profile for the first time and adds a pet if that's the case
        await firstprof();
        //if the bot accidentally tries to view its own profile, set the user variable to the message author
        if(user.id == "500668020226523146") {user = message.author}
        //gets the user row
        let urow = await sql.get(`SELECT * FROM users WHERE userId = ?`, user.id)
        if(!urow) return errmsg(`There was an error acessing your information, please try again`)
        //determines if the username can be further down because of a shorter bio
        var namecoord = row.bio.length < 50 ? 500 : 480
        if(user.username.length > 18){namecoord = namecoord-60}
        //image profile:
        //loads the correct bars and calculates their sizes
        var lvldifxp = Math.pow(10*(row.lvl+1), 2)-Math.pow(10*row.lvl, 2)
        var relxp = row.xp - Math.pow(10*row.lvl, 2)
        var pperc = relxp/lvldifxp
        var perc = (Math.round(pperc*10))/10
        if(perc > 1){perc = 1}
        else if (perc < 0){perc = 0}
        usrname = user.username
        var images = [`${row.background}`, "../Al-An/assets/menus/userprof.png", user.avatarURL != undefined ? user.avatarURL : user.defaultAvatarURL, `../Al-An/assets/bars/users/${perc}.png`, `https://i.imgur.com/14laFiB.png`]
        var jimps = []
        for (var i = 0; i < images.length; i++){
            jimps.push(jimp.read(images[i]))
        }
        await Promise.all(jimps).then(function(data) {
            return Promise.all(jimps)
        }).then(async function(data){
            data[2].resize(337,335)
            data[3].resize(400,50)
            data[0].composite(data[1], 0, 0) //adds the profile overlay
            data[0].composite(data[2], 831, 351) //adds the avatar
            data[0].composite(data[3], 200, 1125) //adds the XP bar
            //adds a notification if the user has a new one:
            if(urow.mnotif == 1){
                data[4].resize(80, 80)
                data[0].composite(data[4], 1120, 315)
            }
            await jimp.loadFont(`../Al-An/assets/fonts/proffont_white.fnt`).then(async proffont_w => {
                //different fonts
                var proffont_w_t = await jimp.loadFont(`../Al-An/assets/fonts/proffont_white_title.fnt`)
                var proffont = await jimp.loadFont(`../Al-An/assets/fonts/proffont.fnt`)
                var xpfont = await jimp.loadFont(`../Al-An/assets/fonts/xpfont.fnt`)
                var namefont_s = await jimp.loadFont(`../Al-An/assets/fonts/namefont_s.fnt`)
                var levelfont_a = await jimp.loadFont(`../Al-An/assets/fonts/levelfont_a.fnt`)
                var levelfont_b = await jimp.loadFont(`../Al-An/assets/fonts/levelfont_b.fnt`)
                var namefontvar = usrname.length < 18 ? proffont_w_t : namefont_s
                //prints all the values and text on the image
                data[0].print(namefontvar, 80, namecoord, {text: `${`${usrname}`}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 700, 10)
                data[0].print(proffont_w, 80, 535, {text: `${`${row.bio}`}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 700, 10)
                data[0].print(proffont, 170, 670, {text: `${thousandize(row.money)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 500, 0)
                data[0].print(proffont, 170, 760, {text: `${row.crystals}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 500, 0)
                data[0].print(proffont, 170, 850, {text: `${row.pets}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 500, 0)
                data[0].print(levelfont_a, 122, 1080, {text: `${row.lvl}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                data[0].print(levelfont_a, 672, 1075, {text: `${row.lvl+1}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                data[0].print(levelfont_b, 977, 700, {text: `Level﻿${row.lvl}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                data[0].print(xpfont, 409, 1106, {text: `${row.xp}xp`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
            })
            //resets the bots typing status
            message.channel.stopTyping()

            //sends the image as an attachment to a message
            var image = await new Discord.Attachment(await data[0].getBufferAsync(jimp.MIME_PNG))
            message.channel.send(`${urow.mnotif == 1? `You have new notifications, to check them type \`${config.prefix2}notifs\``: ``}`, image).catch(allerrors)
        })
    })
}

else if(cmd == "notifs" || cmd == "notifications"){
    //gets the users notifications
    let nrows = await sql.all(`SELECT * FROM notifications WHERE userId = "${message.author.id}" ORDER BY time DESC`).catch(allerrors)
    if(!nrows || nrows == "") return message.channel.send(`You currently don't have any new notifications.`).catch(allerrors)

    //sends a message with the notifications:
    let msg = ""
    let i = 1
    nrows.forEach((row) => {
        let date = moment(row.time).fromNow()
        msg = msg+`**[${i}]** \`${date}\`:\n<:invis:333197912899321857><:invis:333197912899321857>${row.message}\n\n`
        i++
    })

    sql.run(`UPDATE users SET mnotif = "0" WHERE userId = "${message.author.id}"`)
    message.channel.send(`__Your notifications:__ \n${msg}`).catch(allerrors)

}

else if (cmd == "daily"){
    let row = await sql.get(`SELECT * FROM users WHERE userId = "${message.author.id}"`)
    //checks if the user has a profile
    if(!row) return errmsg(`An error occurred, please try again`).catch(allerrors)
    let dailyrow = await sql.get(`SELECT * FROM usercooldowns WHERE user = "${message.author.id}" AND name = "daily"`)
    //checks if the user has already claimed the daily credits
    if(dailyrow != `` && dailyrow != undefined){
        //creates two moments to compare the time passd
        let nowmom = moment(getcurdate()*1000)
        let datemom = moment(dailyrow.time*1000)
        //variables storing the time difference
        let diffh = Math.abs(nowmom.diff(datemom, `hours`))
        let diffm = Math.abs(nowmom.diff(datemom, `minutes`)) - diffh*60
        let diffs = Math.abs(nowmom.diff(datemom, `seconds`)) - diffh*3600 - diffm*60
        //if the user is on cooldown, return error message
        if (await checkcooldown(`daily`, message.author.id) > 0) return errmsg(`You already claimed your daily credits today! Come back in **${diffh}**h **${diffm}**m **${diffs}**s`, 10)
        //otherwise start a new cooldowm
        else {await newcooldown(`daily`, 86400, message.author.id)}
    }
    //start a new cooldown 
    else {await newcooldown(`daily`, 86400, message.author.id)}
    
    //updates the users credits and daily timer
    sql.run(`UPDATE users SET money = ${row.money+100}, dcooldown = "${Math.floor(Date.now()/1000)}" WHERE userId = "${message.author.id}"`).catch(allerrors)
    return message.channel.send(botye+` ${message.author.username}, you got your 100 daily credits!`)
}

else if (cmd == "item"){
    if(!args[0]) return errmsg(`What do you want to do? (use or sell?)`).catch(allerrors)
    if(args[0] == "sell"){
        //checks how much of what item the user wants to sell
        if((!args[1] || !args[2])) return message.channel.send(botno+`Please specify what and how much you want to sell! \n(Syntax: \`${config.prefix2}item sell <item/category> <amount/'all'>\`)`).catch(allerrors)
        else if (args[1].length < 4) return errmsg(`Please provide at least 4 characters to search for an item.`)

        //variable for storing the item or category name
        let iname = args[1]
        //checks if an item with that name exists in the users inventory
        let irow = await sql.get(`SELECT * FROM useritems WHERE owner = "${message.author.id}" AND name LIKE ?`, `${iname}%`)
        //gets the user row
        let usrrow = await sql.get(`SELECT * FROM users WHERE userId = "${message.author.id}"`)
        
        //creates the embed that will later be sent in chat
        let sellemb = new Discord.RichEmbed()
        .setColor(`#7ff442`)
        //if the user doesn't have an item with that name, check if it's a category name
        if(!irow) {
            let itemrows = await sql.all(`SELECT * FROM useritems WHERE owner = "${message.author.id}" AND type = ? COLLATE NOCASE`, `${args[1].toLowerCase()}`) //using ? to prevent sql injections
            //if the user doesnt have any items in the category, throw an error in chat
            if(itemrows.length < 1) return errmsg(`You don't have any items in this category or an item that's called "${args[1]}".`)
            console.log(itemrows)
            //variable for storing how much money the user gets
            let sellmoney = 0
            //makes sure the defined amount is a number, unless the user is trying to sell all of a category
            if(isNaN(parseInt(iamount)) && args[2].toLowerCase() != "all") return errmsg(`Please specify how much you want to sell in numbers or sell all of a category!`)

            //goes through each item to check if it's sellable and does so if possible
            for(row of itemrows){
                //gets the user row for the newest money value
                let usrrow = await sql.get(`SELECT * FROM users WHERE userId = "${message.author.id}"`)
                //variable for storing how many items the user sells
                let amount = args[2].toLowerCase()
                if(args[2].toLowerCase() == `all`){amount = row.amount}
                //if the item isn't sellable, add a field informing the user and change the color to yellow
                if(row.sellable == 0){
                    sellemb.addField(`Sold:`, botno + ` Couldn't sell\n${row.amount}x ${row.name}`, true)
                    sellemb.setColor(`#FCE303`)
                }
                
                //sells the item
                else{
                    if(amount >= row.amount){
                        //sets the amount of money the user gets
                        sellmoney = row.amount*row.value
                        //if the user sells all or more items than they have, delete the row
                        sql.run(`DELETE FROM useritems WHERE owner = "${message.author.id}" AND name = "${row.name}"`).catch(allerrors)
                        sellemb.addField(`Sold:`, botye + ` all of your ${row.name}\nfor ${sellmoney} credits.`, true)
                    }
                    else{
                        //sets the amount of money the user gets
                        sellmoney = amount*row.value
                        //otherwise, remove the specific amount
                        sql.run(`UPDATE useritems SET amount = "${row.amount-amount}" WHERE owner = "${message.author.id}" AND name = "${row.name}"`).catch(allerrors)
                        sellemb.addField(`Sold:`, botye + ` ${row.amount}x ${row.name}\nfor ${sellmoney} credits`, true)
                    }
                    //adds the money to the user
                    sql.run(`UPDATE users SET money = "${usrrow.money+sellmoney}" WHERE userId = "${message.author.id}"`).catch(allerrors)
                }
            }
        }
        //if the user has an item with that name, sell it if possible
        else{
            console.log(irow)
            //makes sure the defined amount is a number, unless the user is trying to sell all of a category
            if(isNaN(parseInt(args[2].toLowerCase())) && args[2].toLowerCase() != "all") return errmsg(`Please specify how much you want to sell in numbers or sell all of one item!`)
            if(irow.sellable == 0) return errmsg(`You can't sell this item!`)
            //sets the amount to the total if trying to sell all
            let amount = args[2].toLowerCase() == `all` ? irow.amount : args[2].toLowerCase()
            //updates the user's items
            if(amount >= irow.amount){
                //sets the amount of money the user gets
                sellmoney = irow.amount*irow.value
                //if the user sold all items, delete the row
                sql.run(`DELETE FROM useritems WHERE owner = "${message.author.id}" AND name = "${irow.name}"`).catch(allerrors)
                sellemb.addField(`Sold:`, botye + ` all of your ${irow.name}\nfor ${sellmoney} credits`, true)
            }
            else{
                //sets the amount of money the user gets
                sellmoney = amount*irow.value
                //if the user only sold part of the total item amount, reduce the amount
                await sql.run(`UPDATE useritems SET amount = "${irow.amount-amount}" WHERE owner = "${message.author.id}" AND name = "${irow.name}"`).catch(allerrors)
                sellemb.addField(`Sold:`, botye + ` ${amount}x ${irow.name}\nfor ${sellmoney} credits`, true)
            }
            //adds the money to the user
            sql.run(`UPDATE users SET money = "${usrrow.money+sellmoney}" WHERE userId = "${message.author.id}"`).catch(allerrors)
        }

        sellemb.setTitle(`You sold:`)
        message.channel.send(sellemb).catch(allerrors)
    }
    else if(args[0] == "use"){ return errmsg("Items can't be used at this time")
        if(!args[1]) return errmsg(`Please specify which item you want to use!`).catch(allerrors)
        else if(args[1].length < 4) return errmsg(`Please provide at least 4 letters to search for items!`).catch(allerrors)

        //checks if the specified item exists
        let irow = await sql.get(`SELECT * FROM items WHERE name LIKE ?`, `${args[1]}%`)
        if(!irow) return errmsg(`There's no item called / staring with "${args[1]}"!`) .catch(allerrors)
        //checks if the user owns the item
        let uirow = await sql.get(`SELECT * FROM useritems WHERE name = "${irow.name}" AND owner = "${message.author.id}"`)
        if(!uirow) return errmsg(`You don't own this item!`).catch(allerrors)

        //for finding the correct pet
        let usrpet = args[3]
        if(uirow.useable=="pets"){usrpet=args[2]}

        //defines the amount of items used
        let iamount = 1
        if(     uirow.useable == "pets" && (!args[3] || isNaN(parseInt(args[3])))){/*do nothing here*/}     //standard amount is 1
        else if(uirow.useable == "pets" &&   args[3]  > uirow.amount)             {iamount = uirow.amount}  //if the user wants to use more items than owned, all get used
        else if(uirow.useable == "pets")                                          {iamount = args[3]}       //the amount the user specified is used
        //if the user doesn't need to specify a pet, the third argument (args2) becomes the amount
        else if(uirow.useable == "users"&& (!args[2] || isNaN(parseInt(args[2])))){/*do nothing here*/}
        else if(uirow.useable == "users"&&   args[2]  > uirow.amount)             {iamount = uirow.amount}  //if the user wants to use more items than owned, all get used
        else                                                                      {iamount = args[2]}       //the amount the user specified is used

        //checks if the item needs to be used on a pet
        if(uirow.useable == "pets" && !args[2]) return errmsg(`You have to use this item on a pet!`).catch(allerrors)
        else if(uirow.useable == "nothing") return errmsg(`You can't use this item!`).catch(allerrors)
        else if(uirow.useable = "pets"){
            //checks if the user owns a pet with the specified name
            let petrow = await sql.get(`SELECT * FROM pets WHERE owner = "${message.author.id}" AND name = "${usrpet.toLowerCase()}" COLLATE NOCASE`)
            if(!petrow) return errmsg(`You don't have a pet called ${usrpet}`).catch(allerrors)
            else{
                switch(uirow.name){
                    //different effects for different items used:
                    case`Healthpotion`: {
                        if(petrow.health == petrow.maxhealth) return message.channel.send(`${botno} Your pet is already at full HP!`)
                        else if(petrow.ko == 1) return errmsg(`${petrow.name} is unconscious, you can't heal it yet!`)
                        //variables for below:
                        let pethealth = petrow.health
                        let maxpethealth = petrow.maxhealth
                        let itemamount = uirow.amount 

                        sql.run(`UPDATE pets SET health = "${pethealth + itemamount}" WHERE owner = "${message.author.id}" AND name = "${petrow.name}"`)
                        //if the user has more than one item left one gets subtracted
                        if(itemamount > 1){sql.run(`UPDATE useritems SET amount = "${itemamount-1}" WHERE owner = "${message.author.id}" AND name = ?`, `${irow.name}`)}
                        //if the user only has 1 item left, it deletes the row
                        else{sql.run(`DELETE from useritems WHERE owner = "${message.author.id}" AND name = ?`, `${irow.name}`)}
                        let finalhealth = pethealth + iamount*uirow.effectval
                        let endhealth = ""
                        //if the pet is fully healed a word is added
                        let abc = finalhealth > maxpethealth ? "fully " : ""
                        if(finalhealth > maxpethealth){
                            //if the pet would have more health than its maximum health it gets set to the max
                            sql.run(`UPDATE pets SET health = "${maxpethealth}" WHERE owner = "${message.author.id}" AND name = "${petrow.name}"`)
                            endhealth = maxpethealth
                        }
                        else if(finalhealth <= maxpethealth){
                            //else the healing is fully applied
                            sql.run(`UPDATE pets SET health = "${finalhealth}" WHERE owner = "${message.author.id}" AND name = "${petrow.name}"`)
                            endhealth = finalhealth
                        }
                        message.channel.send(`${botye} You used **${iamount}x ${irow.name}** to ${abc}heal your pet ${petrow.name} up to **${endhealth} health**!`).catch(allerrors)
                        
                        break;
                    }
                    case `Staminapotion`: {
                        //checks if the pet can use the potion
                        if(petrow.stamina >= petrow.maxstamina) return errmsg(`Your pet is already at full stamina!`).catch(allerrors)
                        else{
                            //checks if the staminaboost would exceed the maximum stamina:
                            let finalstamina = uirow.effectval*iamount + petrow.stamina
                            if(finalstamina>petrow.maxstamina){
                                //sets the stamina gained to the amount needed to reach the max and adjusts the ite mamount accordingly
                                iamount = Math.ceil((petrow.maxstamina-petrow.stamina)/uirow.effectval)
                                finalstamina = petrow.maxstamina
                            }
                            
                            //updates the stamina and items
                            sql.run(`UPDATE pets SET stamina = "${finalstamina}" WHERE owner = "${message.author.id}" AND name = "${petrow.name}"`)
                            if(uirow.amount > 1){sql.run(`UPDATE useritems SET amount = "${uirow.amount-iamount}" WHERE name = "${uirow.name}" AND owner = "${message.author.id}"`)}
                            else{sql.run(`DELETE FROM useritems WHERE name = "${uirow.name}" AND owner = "${message.author.id}"`)}

                            //sends a confirmation message and changes some words if it's fully regenerated
                            let abc = finalstamina<petrow.maxstamina ? `to **${finalstamina}**` : `**fully**`
                            message.channel.send(botye+` You used **${iamount}x ${irow.name}** to regenerate your pet's stamina ${abc}.`)
                        }
                        break;
                    }
                    default: {
                        errmsg(`An error occurred, please try again.`).catch(allerrors)
                    }
                }
            }
        }
    }
}

else if (cmd == "inv" || cmd == "inventory"){
    //checks if the user can use this command right now
    if(await checkcooldown(`inv`, message.author.id) > 0) return message.channel.send(botex+`Please wait **${await checkcooldown(`inv`, message.author.id)}s** before using this command!`).then(async(msg) => {await sleep(4000); msg.delete()}).catch(allerrors) 
    else {await newcooldown(`inv`, -10, message.author.id)}

    var usrrow = await sql.all(`SELECT * FROM useritems WHERE owner = "${message.author.id}"`).catch(allerrors)
    var rows = await sql.all(`SELECT * FROM useritems WHERE owner = "${message.author.id}" ORDER BY type`).catch(allerrors)
    //checks if the user has any items
    if(!usrrow) return message.channel.send(botno+`You don't have any items`).catch(allerrors)
    else{
        //adds all items to an array so they can be displayed
        var iname = []
        var itype = []
        var iamount = []
        var itime = []
        var igotat = []
        var ivalue = []
        rows.forEach((row) => {
            iname.push(row.name)
            itype.push(row.type)
            iamount.push(row.amount)
            itime.push(row.decaytime)
            igotat.push(row.time)
            ivalue.push(row.value)
        })
        //displays all items in an embed
        var invemb = new Discord.RichEmbed()
        .setTitle(`${message.author.username}'s Inventory`)
        .setColor(`#d1e2f3`)
        for(i=0; i<iname.length; i++){
            //converts timestamps into readable format

            let nowdate = new Date()
            let decaydate = new Date((itime[i]+igotat[i])*1000)

            //calculates the time difference for the decay time
            let days =  Math.abs(moment(nowdate).diff(decaydate, `days`))
            let hours = Math.abs(moment(nowdate).diff(decaydate, `hours`))   - days*24
            let mins =  Math.abs(moment(nowdate).diff(decaydate, `minutes`)) - days*1440 - hours*60
            let secs =           moment(decaydate).diff(nowdate, `seconds`) - days*86400 - hours*3600 - mins*60 //switch decaydate and nowdate to get positive number, can't use Math.abs since we need to test if it's negative later

            //if an item would have decayed in this time, remove it
            if(secs <= 0){
                if(iamount[i] < 2){//user only has 1 item left
                    //delete the row
                    sql.run(`DELETE FROM useritems WHERE owner = "${usrrow.userId}" AND name = "${iname[i]}"`).catch(allerrors)
                    //notify the user
                    return newnotif(`All of your ${iname[i].toLowerCase()} decayed!`, row.owner)
                }
                else{//otherwise remove 1 item and reset time
                    await sql.run(`UPDATE useritems SET amount = "${iamount[i]-1}", time = "${getcurdate()}" WHERE owner = "${usrrow[0].owner}" AND name = "${iname[i]}"`).catch(allerrors)
                }
            }
            if(iamount[i]-1 > 0){//if the user still has at least 1 of this item, add it to the embed
                //variables to store the decay time in
                let decayd = days>=1 ? `${days}d ` : ``
                let decayh = hours>=1 ? `${hours}h ` : ``
                let decaym = mins>=1 ? `${mins}m ` : ``
                let decays = secs>=0 ? `${secs}s` : `${secs}s`
                let decay = itime[i] != 0 ? `\n[Decays in ${decayd+decayh+decaym+decays}]` : ``

                //adds a new field for each item, only adds the value if it's sellable
                invemb.addField(`\`${iamount[i]}x ${iname[i]}\``, `Type: ${itype[i]}${iamount[i]*ivalue[i] > 0 ? `\nValue: ${iamount[i]*ivalue[i]}¥\n${decay}` : decay}\n⁣`, true)
            }

        }
        let checkusritemsagain = await sql.get(`SELECT * FROM useritems WHERE owner = "${message.author.id}"`)
        if(!checkusritemsagain){invemb.addField(`Empty`, `You don't have any items!`, true)}
        message.channel.send(invemb).catch(allerrors)
    }
}

else if (cmd == "shop" || cmd == "buy"){
    //checks the menu cooldown for this user and stops them from using multiple menus at once:
    if (await checkcooldown(`menu`, message.author.id) > 0) return errmsg(`You already have an open menu, please close it before opening another one.`)
    else {await newcooldown(`menu`, 60, message.author.id)}

    //gets the user's row
    let urow = await sql.get(`SELECT * FROM users WHERE userId = "${message.author.id}"`)

    //for displaying which categories exist
    let categrows = await sql.all(`SELECT category FROM items`)
    let categoriesar = []
    let categories = " None"
    categrows.forEach(async(row) => {
        //if the name was already added it doesn't do anything
        if(categoriesar.includes(row.category)){}
        //adds the name of the category to the row
        else{categoriesar.push(row.category)}
    })
    if(categoriesar != []){
        categories = ""
        for(i=0;i<categoriesar.length;i++){
            categories = categories += `\n• ${categoriesar[i]}`
        }
    }

    let firstmsgauthor = message.author
    if(!args[0] || args[0].toLowerCase() == "help") return errmsg(`Which category do you want to view? Available categories:${categories}`)
    //adds the items to the menu
    var rows = await sql.all(`SELECT * FROM items WHERE category LIKE ? ORDER BY price ASC`, `${args[0]}%`)
    var irow = await sql.get(`SELECT * FROM items WHERE category LIKE ?`, `${args[0]}%`)
    //checks if the item category exists
    if(rows == "") return errmsg(`There is no category called ${args[0]}!`).catch(allerrors)

    //emojis for the shop icons
    let iname = irow.name
    let ilvl = irow.lvl

    let shopemb = new Discord.RichEmbed()
    .setTitle(`${irow.category} - Shop`)
    .setFooter(`Use "${config.prefix2}buy <item name|ID> <amount> (<currency>)" to buy something | Use "${config.prefix2}exit" to exit the stop`)
    let inames = []
    i = 1
    rows.forEach(async(row) => { //cycles through all rows and adds all the names to the array
        iname = row.name
        ilvl = row.lvl
        //determines if the item can be bought with crystals, if not it doesn't display them
        let itemcrystals = row.cprice > 0 ? `   |<:smallcrystals:547783053565493248> ${row.cprice}` : ``
        //only displays levels if they are greater than 0
        let itemlvl = ilvl > 0 ? ` Lvl. ${ilvl}` : ``
        //adds the name to an array for later
        inames.push(row.name.toLowerCase())
        //checks if the item has a decay time and adds it to the shop if it does
        let decay = ""
        if(row.time != 0){
            let nowdate = new Date()
            let timedate = new Date()
            timedate.setSeconds(timedate.getSeconds()+row.time)

            let days = moment(timedate).diff(nowdate, `days`);console.log(days)
            let hours = moment(timedate).diff(nowdate, `hours`) - days*24;console.log(hours)
            let mins = moment(timedate).diff(nowdate, `minutes`) - days*24*60 - hours*60;console.log(mins)
            let secs = moment(timedate).diff(nowdate, `seconds`) - days*24*60*60 - hours*60*60 - mins*60

            let decayd = days>=1 ? `${days}d ` : ``
            let decayh = hours>=1 ? `${hours}h ` : ``
            let decaym = mins>=1 ? `${mins}m ` : ``
            let decays = ``//secs>=1 ? `${secs}s` : `0s`
            decay = row.time!=0 ? `\n<:botinvis:551107345359437852> Decay: ${decayd+decayh+decaym+decays}` : ``
        }
        //adds the field    
        shopemb.addField(`${row.emoji == null ? `❔` : row.emoji} ${row.name}${itemlvl}`, `<:botinvis:551107345359437852> \`ID: [${i}]\`\n<:botinvis:551107345359437852> Price: <:smallcredits:547782643530596362> ${row.price}${itemcrystals}${decay}\n⁣`, true)
        
        //increases the row number
        i++
    })
    let smsg = await message.channel.send(shopemb).catch(allerrors) //ERROR HERE

    const collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 60000 });
    collector.on('collect', async message => {
        //ignores other user's messages
        if(message.author.id != firstmsgauthor.id) return
        //gets the arguments on the new message
        let args2 = message.cleanContent.slice(config.prefix2.length).trim().split(/ +/g);
        //gets the users response
        if(message.content.startsWith(`exit`)|| message.content.startsWith(`${config.prefix2}exit`)) return collector.stop() //exits the shop
        else if(message.content.startsWith(`${config.prefix2}buy`)) {
            //checks if the user specified an item
            if(!args2[1]) return errmsg(`Please specify what you want to buy.`).catch(allerrors)

            //checks if the specified item is in the items array or a number
            else if(inames.includes(args2[1].toLowerCase()) == false && isNaN(parseInt(args2[1]))) return errmsg(`Please choose a number from 1 - ${i-1} or an item name!`).catch(allerrors)

            //if the number is too high:
            else if(parseInt(args2[1]) > i-1) return errmsg(`Please choose a number from 1 - ${i-1}!`).catch(allerrors)

            //if everything is okay:
            else{
                //determines which curency the user chose
                let cur = "money"
                let itrow = await sql.get(`SELECT * FROM items WHERE name = ? COLLATE NOCASE`, `${args2[1].toLowerCase()}`)
                if(itrow == undefined){
                    itrow = await sql.get(`SELECT * FROM items WHERE name = ? COLLATE NOCASE`, `${inames[args2[1]-1]}`)
                    if(itrow == undefined) return errmsg(`There's no item called / with an ID of "${args2[1]}"`)
                }
                let buyamount = parseInt(args2[2])

                //updates the user row to get the latest stats
                urow = await sql.get(`SELECT * FROM users WHERE userId = "${message.author.id}"`)

                if(itrow.cprice == 0){cur = `money`}
                else if(!args2[3]){cur = "money"}
                else if(args2[3].toLowerCase() == "crystals" || args2[3].toLowerCase() == "ioncrystals"){cur = `crystals`}
                //checks if an amount was specified
                if(!args2[2] || isNaN(buyamount) || buyamount < 1) return errmsg(`Please specify how much you want to buy in full numbers larger than 0.`).catch(allerrors)
                
                //if an item name was specified
                //determines which price has to be chosen
                let iprice = cur == "money" ? `price` : `cprice`
                //checks if the user has enough money
                if(cur == "money" && urow.money < itrow.price*buyamount) return errmsg(`You don't have enough credits to buy this!`).catch(allerrors)
                else if(cur == "crystals" && urow.crystals < itrow.cprice*buyamount) return errmsg(`You don't have enough crystals to buy this!`).catch(allerrors)
                else{
                    //if the user has enough money, it checks if the item has a limit and if it's reached
                    let usritrow = await sql.get(`SELECT * FROM useritems WHERE owner = "${firstmsgauthor.id}" AND name = "${itrow.name}"`).catch(allerrors)
                    let itemamount = 0
                    //checks how many items the user already has
                    
                    if(!usritrow){itemamount = 0}
                    else{itemamount = usritrow.amount}
                    //checks if the user can have more items of that type
                    if(itrow.max != 0 && itemamount == itrow.max) return message.channel.send(botno + ` You can't own any more than of these at once!`).catch(allerrors)
                    //if the specified amount is more than the user can have it gets set to the maximum
                    else if(itrow.max != 0 && itemamount+buyamount > itrow.max){buyamount = itrow.max-itemamount}
                    
                    //updates the database
                    newuseritem(buyamount, itrow.name, firstmsgauthor.id).catch(allerrors)
                    sql.run(`UPDATE users SET ${cur} = "${urow.money - (itrow[iprice]*buyamount)}" WHERE userId = "${firstmsgauthor.id}"`).catch(allerrors)
                    message.channel.send(botye+` You bought ${buyamount}x ${itrow.name} for ${itrow[iprice]*buyamount} ${cur == "money" ? "credits" : cur}.`).catch(allerrors)
                }
            }
        }
    })
    collector.on(`end`, e => {
        //edits the shop embed and allows the user to open another menu
        exitemb = new Discord.RichEmbed()
        .setTitle(botex + `Exited Shop`)
        .setDescription(` <@${message.author.id}>'s ${irow.category}-shop timed out`)
        sql.run(`UPDATE users SET mcooldown = "0" WHERE userId = "${firstmsgauthor.id}"`)
        smsg.edit(exitemb).catch(allerrors)
    })
}

else if (cmd == "background" || cmd == "backgrounds"){
    usr = message.author
    var largersmaller = `>`
    var range = -1
    //chekcs if the user specified a category
    if(!args[0]) return message.channel.send(botno+`Which background category do you want to view?\n\`Abstract/Animals/Anime/Games/Stellar/Subnautica\``).catch(allerrors)
    //checks if a range was given
    if(args[1] == "<" || args[1] == ">") {largersmaller = args[1]}
    if(args[2] !== undefined && !isNaN(args[2])){range = args[2]}

    let categ = args[0].toLowerCase()
    let tempvar = `SELECT * FROM backgrounds WHERE category LIKE ? AND mcost ${largersmaller} ${range} COLLATE NOCASE ORDER BY mcost ASC`
    //to avoid multiple categories being displayed
    if(args[0] == "a"){categ = `Abstract`}
    else if(args[0] == "an" || args[0] == "ani" || args[0] == "anim"){categ = `Anime`}

    //the users row
    let urow = await sql.get(`SELECT * FROM users WHERE userId = "${message.author.id}"`)

    //checks the menu cooldown for this user and stops them from using multiple menus at once:
    if (await checkcooldown(`menu`, message.author.id) > 0) return errmsg(`You already have an open menu, please close it before opening another one.`)
    else {await newcooldown(`menu`, 100, message.author.id)}

    //adds all backgrounds from a category to an array
    let bgs = []
    let bgmc = []
    let bgcc = []
    var rows = await sql.all(tempvar, `${categ}%`)
    if(rows=="") return errmsg(`There are no results for your current filter settings or the specified category might not exist.`).catch(allerrors)
    
    rows.forEach((row) => {
        bgs.push(row.url)
        bgmc.push(row.mcost)
        bgcc.push(row.ccost)
    })
    //sends the embed
    i = 0
    //for being able to use the category name correctly
    var row = await sql.get(`SELECT * FROM backgrounds WHERE category LIKE ? AND mcost ${largersmaller} ${range}  COLLATE NOCASE`, `${categ}%`)
    let categname = row.category

    async function geturow() {urow = await sql.get(`SELECT * FROM users WHERE userId = "${message.author.id}"`)}

    bmsg = await message.channel.send(`**${categname} backgrounds:**\n\n__Cost:__\n\n<:credits:544215099070480384> - ${bgmc[i]}\n<:crystals:544216012342558730> - ${bgcc[i]}\n\n${bgs[i]}`).catch(allerrors)
    await bmsg.react(`◀`).catch(allerrors)
    await bmsg.react(bot.emojis.get("544215099070480384")).catch(allerrors)
    await bmsg.react(bot.emojis.get("544216012342558730")).catch(allerrors)
    await bmsg.react(bot.emojis.get("545687556595908612")).catch(allerrors)
    await bmsg.react(`🚫`).catch(allerrors)
    await bmsg.react(`▶`).catch(allerrors)

    //checks for reactions
    const filter = (reaction, user) => !user.bot && user.id ==usr.id;
    let collector = bmsg.createReactionCollector(filter, { time: 100000 });
    let exited = 0
    collector.on('collect', async (reaction, collector) => {

		const chosen = reaction.emoji.name;
		if(chosen == "◀"){
            //removes the user's reaction
            bmsg.reactions.get("◀").remove(message.author.id).catch(allerrors)
            i = i-1
            if(i<0){i = 0}
            bmsg.edit(`**${categname} backgrounds:**\n\n__Cost:__\n\n<:credits:544215099070480384> - ${bgmc[i]}\n<:crystals:544216012342558730> - ${bgcc[i]}\n\n${bgs[i]}`).catch(allerrors)
        }
        else if (chosen == "▶"){
            //removes the user's reaction
            bmsg.reactions.get("▶").remove(message.author.id).catch(allerrors)
            i = i+1
            if(bgs[i]==undefined){i = i-1}
            bmsg.edit(`**${categname} backgrounds:**\n\n__Cost:__\n\n<:credits:544215099070480384> - ${bgmc[i]}\n<:crystals:544216012342558730> - ${bgcc[i]}\n\n${bgs[i]}`).catch(allerrors)
        }
        else if (chosen==`credits`){
            //removes the user's reaction
            bmsg.reactions.get(`credits:544215099070480384`).remove(message.author.id).catch(allerrors)
            //checks if the user can buy the background, updates urow to get the current stats
            await geturow()
            if(urow.money < bgmc[i]) return bmsg.edit(`**${categname} backgrounds:**\n\n__Cost:__\n\n<:credits:544215099070480384> - ${bgmc[i]}\n<:crystals:544216012342558730> - ${bgcc[i]}\n${botno}\`You don't have enough credits to buy this!\`\n\n${bgs[i]}`).catch(allerrors)
            
            //removes the money and adds the background
            sql.get(`SELECT * FROM userbackgrounds WHERE url = "${bgs[i]}" AND owner = "${message.author.id}"`).then((row) =>{
                if(!row){
                    sql.run(`UPDATE users SET money = "${urow.money-bgmc[i]}" WHERE userId = "${message.author.id}"`).then(() => console.log(`ok - `+bgmc[i])).catch(allerrors)
                    sql.run(`INSERT INTO userbackgrounds (category, url, owner) VALUES (?, ?, ?)`, categname, bgs[i], message.author.id)
                    bmsg.edit(`**${categname} backgrounds:**\n\n__Cost:__\n\n<:credits:544215099070480384> - ${bgmc[i]}\n<:crystals:544216012342558730> - ${bgcc[i]}\n${botye}\`You bought this background!\`\n\n${bgs[i]}`).catch(allerrors)
                }
                //checks if the user already has the background
                else return bmsg.edit(`**${categname} backgrounds:**\n\n__Cost:__\n\n<:credits:544215099070480384> - ${bgmc[i]}\n<:crystals:544216012342558730> - ${bgcc[i]}\n${botno}\`You already own this background!\`\n\n${bgs[i]}`).catch(allerrors)
            }).catch(() =>{sql.run("CREATE TABLE IF NOT EXISTS userbackgrounds (url INTEGER, category TEXT, owner INTEGER)")})
        }
        else if (chosen==`crystals`){
            //removes the user's reaction
            bmsg.reactions.get(`crystals:544216012342558730`).remove(message.author.id).catch(allerrors)
            //checks if the user can buy the background, updates urow to get the current stats
            await geturow()
            if(urow.crystals < bgcc[i]) return bmsg.edit(`**${categname} backgrounds:**\n\n__Cost:__\n\n<:credits:544215099070480384> - ${bgmc[i]}\n<:crystals:544216012342558730> - ${bgcc[i]}\n${botno}\`You don't have enough crystals to buy this!\`\n\n${bgs[i]}`).catch(allerrors)
            
            //removes the crystals and adds the background
            sql.get(`SELECT * FROM userbackgrounds WHERE url = "${bgs[i]}" AND owner = "${message.author.id}"`).then((row) =>{
                if(!row){
                    sql.run(`UPDATE users SET crystals = "${urow.crystals-bgcc[i]}" WHERE userId = "${message.author.id}"`).catch(allerrors)
                    sql.run(`INSERT INTO userbackgrounds (category, url, owner) VALUES (?, ?, ?)`, categname, bgs[i], message.author.id)
                    bmsg.edit(`**${categname} backgrounds:**\n\n__Cost:__\n\n<:credits:544215099070480384> - ${bgmc[i]}\n<:crystals:544216012342558730> - ${bgcc[i]}\n${botye} \`You bought this background!\`\n\n${bgs[i]}`).catch(allerrors)
                }
                //checks if the user already has the background
                else return bmsg.edit(`**${categname} backgrounds:**\n\n__Cost:__\n\n<:credits:544215099070480384> - ${bgmc[i]}\n<:crystals:544216012342558730> - ${bgcc[i]}\n${botno} \`You already own this background!\`\n\n${bgs[i]}`).catch(allerrors)
            }).catch(() =>{sql.run("CREATE TABLE IF NOT EXISTS userbackgrounds (url INTEGER, category TEXT, owner INTEGER)")})
        }
        else if (chosen==`setbg`){
            //removes the users reaction
            bmsg.reactions.get(`setbg:545687556595908612`).remove(message.author.id).catch(allerrors)
            //checks if the user owns the background
            sql.get(`SELECT * FROM userbackgrounds WHERE url = "${bgs[i]}" AND owner = "${message.author.id}"`).then((row) =>{
                if(!row){
                    //the user doesn't own the background
                    bmsg.edit(`**${categname} backgrounds:**\n\n__Cost:__\n\n<:credits:544215099070480384> - ${bgmc[i]}\n<:crystals:544216012342558730> - ${bgcc[i]}\n${botno} \`You don't own this background!\`\n\n${bgs[i]}`).catch(allerrors)
                }
                else{
                    sql.run(`UPDATE users SET background = "${bgs[i]}" WHERE userId = "${message.author.id}"`).catch(allerrors)
                    bmsg.edit(`**${categname} backgrounds:**\n\n__Cost:__\n\n<:credits:544215099070480384> - ${bgmc[i]}\n<:crystals:544216012342558730> - ${bgcc[i]}\n${botye} \`You changed your background!\`\n\n${bgs[i]}`).catch(allerrors)
                }
            }).catch(() =>{sql.run("CREATE TABLE IF NOT EXISTS userbackgrounds (url INTEGER, category TEXT, owner INTEGER)")})
        }
        else if (chosen==`🚫`){
            exited = 1
            collector.stop()
        }
        else return collector.stop()
	});
	collector.on('end', collected => {
        if(exited==1){bmsg.edit(botex+`Exited background menu.`)}
        else {bmsg.edit(botex+`${usr.username}'s background menu timed out.`)}
        
        //resets the menu cooldown and clears all reactions
        sql.run(`UPDATE users SET mcooldown = "0" WHERE userId = "${message.author.id}"`).catch(allerrors)
        bmsg.clearReactions().catch(allerrors)
    });
}

else if(cmd == "tame" || cmd == "tames"){
    //if the user doesn't specify what they want to do, send an error message
    if(!args[0]) return errmsg(`Please specify if you want to view or force-feed your tames.\nType \`${config.prefix2}help tames\` for more information.`, 10)

    //checks the tame command cooldown for this user and stops them from using the command again too soon:
    if (await checkcooldown(`tamecmd`, message.author.id) > 0) return errmsg(`Please wait ${await checkcooldown(`tamecmd`, message.author.id)} seconds before using this command again.`)
    else {await newcooldown(`tamecmd`, 15, message.author.id)}
    //checks the menu cooldown for this user and stops them from using multiple menus at once:
    if (await checkcooldown(`menu`, message.author.id) > 0) return errmsg(`You already have an open menu, please close it before opening another one.`)
    else {await newcooldown(`menu`, 60, message.author.id)}

    //gets all of the users ongoing tames from the database
    let tamerows = await sql.all(`SELECT * FROM tames WHERE userId = "${message.author.id}"`).catch(allerrors)
    //if the user doesn't have any ongoing tames, send an error message
    if(tamerows == "" || tamerows == undefined) return errmsg(`You don't have any ongoing tames!`)

    //variable to store the msgauthor id
    let msgauthid = message.author.id

    if(args[0].toLowerCase() == "view"){//user wants to view a tame
        //variable to store the data from each tame to display on the message
        let txt = ``
        //array to store the tame times in (use as key for the database)
        let tametimes = []
        //goes through each tame and adds the name, lvl and species to the txt variable for the user to select from
        for(i in tamerows){
            txt = txt + `[${parseInt(i)+1}] ${tamerows[i].name} (lvl ${tamerows[i].lvl} ${tamerows[i].species})`
            tametimes.push(tamerows[i].time)
        }
        //sends a message asking the user which tame to access
        let msg1 = await message.channel.send(`\`\`\`py\nWhich of your ongoing tames do you want to view?\n\n${txt}\n\nTo exit this menu type 'cancel'.\`\`\``).catch(allerrors)
        
        //creates a message collector to listen for the users answer for 30 seconds
        const collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 30000 });
        collector.on('collect', async message => {
            //gets the arguments on the new message
            let args2 = message.cleanContent.slice(0).trim().split(/ +/g);

            if(args2[0].toLowerCase() == "cancel"){collector.stop()}
            //is the user sends something other than a number that relates to a certain tame, send an error message
            else if(isNaN(args2[0]) || args2[0] > tametimes.length || args2[0] < 1) return errmsg(`Please send a valid number.`)
            else{
                //gets the data for the selected tame from the database
                let tamerow = await sql.get(`SELECT * FROM tames WHERE userId = "${message.author.id}" AND time = ?`, tametimes[args2[0]-1])
                //if the tame isn't found, send an error message
                if(!tamerow) return errmsg(`Sorry, there was an error while accessing your tame data. Please try again.`)

                //gets the creature row for the tame's species
                let crrow = await sql.get(`SELECT * FROM creatures WHERE species = "${tamerow.species}"`).catch(allerrors)
                //if the creature row isn't found, send an error message
                if(!crrow) return errmsg(`Sorry, there was an error while accessing your tame's creature data. Please try again.`)

                //deletes the user's response message
                message.delete().catch(allerrors)

                //stops the message collector
                collector.stop();

                //variable to store the amount of food the tame has remaining in
                let tamefoodamt = 0

                //gets the item row for the tame's tamefood
                let itemrow = await sql.get(`SELECT * FROM useritems WHERE name = "${tamerow.foodtype}" AND owner = "${tamerow.userId}"`).catch(allerrors)
                //if the item row exists, set the amount variable to the remaining amount
                if(itemrow != `` && itemrow != undefined){tamefoodamt = itemrow.amount}

                //sets the bot's status to typing so the user knows the command worked
                message.channel.startTyping();

                // --- composes the ability image
                //adds all images that are required to an array
                var images = [ `../Al-An/assets/menus/taming.jpg`, `../Al-An/assets/bars/pets/taming.png`, `../Al-An/assets/bars/pets/torpor.png`, `../Al-An/assets/menus/menuimgs/${crrow.diet}.png`]
                var jimps = [] //empty array to store the jimps later
                for (var i = 0; i < images.length; i++){
                    jimps.push(jimp.read(images[i])) //pushes the processed images to the empty array
                }
                await Promise.all(jimps).then(function(data) {
                    return Promise.all(jimps) //waits for the promise to be resolved
                }).then(async function(data){
                    //variable to store the taming progress in % in
                    let prog = (Math.floor((tamerow.tameprog/tamerow.tamereq)*1000))/10
                    //variable to store the percentage of remaining torpidity in
                    let torpperc = (Math.floor((tamerow.torp/tamerow.maxtorp)*1000))/10
                    //variable to store the size of the taming bar, minimum 1px, maximum 1178
                    let sizextaming = Math.round(1178*(prog/100)) > 1178 ? 1178 :  Math.round(1178*(prog/100)) < 1 ? 1 : Math.round(1178*(prog/100))
                    //variable to store  the size of the torpidiy bar, minimum 1px, maximum 1178
                    let sizextorp = Math.round(1178*(torpperc/100)) > 1178 ? 1178 :  Math.round(1178*(torpperc/100)) < 1 ? 1 : Math.round(1178*(torpperc/100))

                    //changes the size of the taming bar to represent the progress
                    data[1].resize(sizextaming, 98)
                    //changes the size of the torpidity bar to represent the remaining torpidity
                    data[2].resize(sizextorp, 98)
                    //resizes the diet icon (makes the carnivore icon slightly bigger)
                    if(crrow.diet == "Carnivore"){data[3].resize(55, 55)}
                    else{data[3].resize(50, 50)}
                
                    //this is where we composit the images together
                    data[0].composite(data[1], 52, 38)  //adds the taming bar
                    data[0].composite(data[2], 52, 183) //adds the torpidity bar
                    data[0].composite(data[3], 660,595) //adds the diet icon
                    // --- add any text that we need
                    await jimp.loadFont(`../Al-An/assets/fonts/unisans_50.fnt`).then(async font => {
                        //loads an even larger font variant
                        var font_l = await jimp.loadFont(`../Al-An/assets/fonts/unisans_65.fnt`)

                        // --- prints all the values and text on the image
                        data[0].print(font_l, 640, 45, {text: `Taming﻿progress﻿(${prog}%)`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(font_l, 640, 190, {text: `Torpidity﻿(${torpperc}%)`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        //adds the enemy species and lvl
                        data[0].print(font, 130, 395, {text: `${tamerow.species}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(font, 530, 392, {text: `${tamerow.lvl}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        //adds the enemy (max)health
                        data[0].print(font, 130, 495, {text: `${thousandize(tamerow.health)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(font, 440, 495, {text: `${thousandize(tamerow.maxhealth)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        //adds the enemy shields
                        data[0].print(font, 130, 595, {text: `${thousandize(tamerow.shields)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        //adds the enemy strength and torpidity damage
                        data[0].print(font, 760, 395, {text: `${tamerow.attack}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(font, 1120,395, {text: `${crrow.torpiditydmg}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        //adds the enemy (max)stamina
                        data[0].print(font, 760, 495, {text: `${thousandize(tamerow.stamina)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(font, 1085,495, {text: `${thousandize(tamerow.maxstamina)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        //adds the food amount & taming food type and amount
                        data[0].print(font, 760, 595, {text: `${thousandize(tamerow.food)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(font, 1085,595, {text: `${thousandize(tamerow.maxfood)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(font, 760, 700, {text: `${thousandize(tamerow.foodtype)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                        data[0].print(font, 790, 765, {text: `${thousandize(tamefoodamt)}﻿remaining`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                    })
                    //saves the composited image to a buffer
                    var image = new Discord.Attachment(await data[0].getBufferAsync(jimp.MIME_PNG))

                    //variable geths the user's user object
                    let tameuser = await bot.fetchUser(tamerow.userId)
                    //sends the message with the image as an attachment
                    await message.channel.send(`${tameuser.username}'s taming card for **${tamerow.name}**:\n⁣`, image).catch(allerrors)
                    //resets the typing status
                    message.channel.stopTyping();
                })
            }
        })
        collector.on('end', async e => {
            //deletes the bot's original message
            msg1.delete().catch(allerrors)
            //removes the users menu cooldown
            removecooldown(`menu`, msgauthid)
        })
    }
    else if(args[0].toLowerCase() == "feed"){//user wants to feed a tame
        //gets the item row for the tame's tamefood
        let itemrows = await sql.all(`SELECT * FROM useritems WHERE owner = "${msgauthid}" AND category = "Food"`).catch(allerrors)
        //if no items are found, send an error message
        if(itemrows == "" || itemrows == undefined) return errmsg(`You don't have any food items to feed your tames!`)
        //variable to store the data from each tame to display on the message
        let txt = ``
        //array to store the tame times in (use as key for the database)
        let tametimes = []
        //goes through each tame and adds the name, lvl and species to the txt variable for the user to select from
        for(i in tamerows){
            txt = txt + `[${parseInt(i)+1}] ${tamerows[i].name} (lvl ${tamerows[i].lvl} ${tamerows[i].species})\n`
            tametimes.push(tamerows[i].time)
        }   
        //sends a message asking the user which tame to access
        let msg1 = await message.channel.send(`\`\`\`py\nWhich of your tames do you want to feed?\n\n${txt}\nTo exit this menu type 'cancel'.\`\`\``).catch(allerrors)

        
        //variable to store if the user reacted or the menu timed out
        let reacted = 0
        //creates a message collector to listen for the users answer for 30 seconds
        const collector = new Discord.MessageCollector(message.channel, m => m.author.id === msgauthid, { time: 30000 });
        collector.on('collect', async message => {
            //gets the arguments on the new message
            let args2 = message.cleanContent.slice(0).trim().split(/ +/g);

            if(args2[0].toLowerCase() == "cancel"){collector.stop()}
            //is the user sends something other than a number that relates to a certain tame, send an error message
            else if(isNaN(args2[0]) || args2[0] > tametimes.length || args2[0] < 1) return errmsg(`Please send a valid number.`)
            else{
                //gets the data for the selected tame from the database
                let tamerow = await sql.get(`SELECT * FROM tames WHERE userId = "${msgauthid}" AND time = ?`, tametimes[args2[0]-1])
                //if the tame isn't found, send an error message
                if(!tamerow) return errmsg(`Sorry, there was an error while accessing your tame data. Please try again.`)

                //gets the creature row for the tame's species
                let crrow = await sql.get(`SELECT * FROM creatures WHERE species = "${tamerow.species}"`).catch(allerrors)
                //if the creature row isn't found, send an error message
                if(!crrow) return errmsg(`Sorry, there was an error while accessing your tame's creature data. Please try again.`)

                //ensures the bot knows the user reacted in time
                reacted = 1
                //new variable for checking if the user reacted to the second collector
                let reacted2 = 0
                //deletes the user's response message
                message.delete().catch(allerrors)

                //stops the message collector
                collector.stop();

                //variable to store all food item names in for display later
                let txt2 = ``
                //array to store the food item names in as key for database
                let fooditems = []

                //goes through each item and adds it to the display variable & the array
                for(i in itemrows){
                    //adds the name and amount to the display variable
                    txt2 = txt2 + `[${parseInt(i)+1}] ${itemrows[i].name} (x ${itemrows[i].amount})\n`
                    //adds the item name to the array 
                    fooditems.push(itemrows[i].name)
                }

                let msg2 = await message.channel.send(`\`\`\`py\nWhich item do you want to feed it?\n\n${txt2}\nTo exit this menu type 'cancel'.\`\`\``).catch(allerrors)
                
                //creates another message collector to listen for the users answer for 30 seconds
                const collector2 = new Discord.MessageCollector(message.channel, m => m.author.id === msgauthid, { time: 30000 });
                collector2.on('collect', async message => {
                    //gets the arguments on the new message
                    let args3 = message.cleanContent.slice(0).trim().split(/ +/g);

                    //if the user cancels, stop the collector
                    if(args3[0].toLowerCase() == "cancel") return collector2.stop()
                    //if the user doesn't send a valid number, send an error message
                    if(isNaN(args3[0] || args3[0] > fooditems.length || args3[0] <= 0)) return errmsg(`Please send a valid number.`)

                    //gets the users food item row to check if they still own it
                    let foodrow = await sql.get(`SELECT * FROM useritems WHERE name = ? AND owner = "${msgauthid}"`, fooditems[parseInt(args3[0])-1]).catch(allerrors)
                    //if the item isnt found, send an error message
                    if(!foodrow) return errmsg(`Sorry, the selected item doesn't exist anymore. Please try again with another one.`)

                    //gets the item row for values
                    let fooditemrow = await sql.get(`SELECT * FROM items WHERE name = "${foodrow.name}" AND category = "Food"`).catch(allerrors)
                    //if the item isnt found, send an error message
                    if(!fooditemrow) return errmsg(`Sorry, there was an error with your item data. Please try again.`)

                    let crrow = await sql.get(`SELECT * FROM creatures WHERE species = "${tamerow.species}"`).catch(allerrors)
                    if(!crrow) return errmsg(`Sorry, there was an error while accessing your tame's creature data. Please try again.`)

                    //object for storing what food each diet requires
                    let foodobj = {Herbivore:[`Vegetation`], Omnivore:[`Vegetation`, `Meat`], Carnivore:[`Meat`]}
                    let tametime = tamerow.time
                    
                    if(!foodobj[crrow.diet].includes(foodrow.type)){//if the user tries to feed the tame something not suitable for it's diet, ask for confirmation
                        //ensures the bot knows the user reacted in time
                        reacted2 = 1
                        //stops the collector
                        collector2.stop()
                        //sends a message informing the user that the item they were trying to feed is the wrong type for this tame's diet
                        let msg3 = await message.channel.send(`Are you sure you want to feed a ${tamerow.species} ${foodrow.tpye.toLowerCase()}? This will hurt them significantly.`)
                        //creates yet another message collector to listen for the users answer for 30 seconds
                        const collector3 = new Discord.MessageCollector(message.channel, m => m.author.id === msgauthid, { time: 15000 });
                        collector3.on('collect', async message => {
                            //gets the arguments on the new message
                            let args3 = message.cleanContent.slice(0).trim().split(/ +/g);

                            if(args3[0].toLowerCase() == "confirm"){//user feeds the item anyways
                                //gets the data for the tame again for newest values
                                let tamerow = await sql.get(`SELECT * FROM tames WHERE userId = "${msgauthid}" AND time = "${tamerow.time}"`)
                                //if the tame isn't found, send an error message
                                if(!tamerow) return errmsg(`Sorry, this tame doesn't exist anymore.`)
                                //variable to calculate the new food and ensure it doesn't esceed the maximum
                                let newfood = tamerow.food+fooditemrow.saturation > tamerow.maxfood ? tamerow.maxfood : tamerow.food+fooditemrow.saturation
                                //variable to calculate the new health amount and ensure it doesn't drop below 0 (hurts the tame because of wrong food type)
                                let newhealth = tamerow.health-fooditemrow.saturation < 0 ? 0 : tamerow.health-fooditemrow.saturation
                                //variable to store the outcome of the feed in
                                let txt3 = `${botye} You fed 1x ${fooditemrow.name} to ${tamerow.name} (\`lvl. ${tamerow.lvl} ${tamerow.species}\`).\n\n• Food +${fooditemrow.effectval}\n • Health -${fooditemrow.effectval}`
                                //updates the food value & health of the tame
                                sql.run(`UPDATE tames SET food = "${newfood}", health = "${newhealth}" WHERE name = "${tamerow.name}" AND userId = "${tamerow.userId}" AND time = "${tamerow.time}"`).catch(allerrors)
                                if(newhealth <= 0){//if the tame dies, remove it from the database
                                    //deletes the tame row
                                    sql.run(`DELETE FROM tames WHERE name = "${tamerow.name}" AND userId = "${tamerow.userId}" AND time = "${tamerow.time}"`).catch(allerrors)
                                    //sends the user a notification
                                    newnotif(`${tamerow.name} (lvl. ${tamerow.lvl} ${tamerow.species}) got killed! Taming unsuccessful.`)
                                    //updates the display variable to add that the tame died
                                    txt3 += `\n\n**Your tame died from the damage!**`
                                }
                                if(foodrow.amount <= 1){//if the user only has one item left, delete it
                                    //deletes the item row
                                    sql.run(`DELETE FROM useritems WHERE owner = "${msgauthid}" AND name = "${fooditemrow.name}"`).catch(allerrors)
                                }
                                else{//otherwise, remove 1
                                    sql.run(`UPDATE useritems SET amount = "${foodrow.amount-1}" WHERE owner = "${msgauthid}" AND name = "${fooditemrow.name}"`).catch(allerrors)
                                }
                                //sends a confirmation message with the outcome
                                message.channel.send(txt3).catch(allerrors)
                            }
                            else if(args3[0].toLowerCase() == "cancel"){//user cancels
                                //stops the collector
                                collector3.stop()
                            }
                        })
                        collector3.on('end', e => {
                            //deletes the bot's third message
                            msg3.delete().catch(allerrors)
                            //removes the users menu cooldown
                            removecooldown(`menu`, msgauthid)
                        })
                    }
                    else{//feed the item and send confirmation
                        //gets the data for the tame again for newest values
                        let tamerow = await sql.get(`SELECT * FROM tames WHERE userId = "${msgauthid}" AND time = "${tametime}"`)
                        //if the tame isn't found, send an error message
                        if(!tamerow) return errmsg(`Sorry, this tame doesn't exist anymore.`)
                        //ensures the bot knows the user reacted in time
                        reacted2 = -1
                        //stops the collector
                        collector2.stop()
                        //variable to calculate the new food and ensure it doesn't esceed the maximum
                        let newfood = tamerow.food+fooditemrow.saturation > tamerow.maxfood ? tamerow.maxfood : tamerow.food+fooditemrow.saturation
                        //variable to display the outcome later
                        let txt3 = `${botye} You fed 1x ${fooditemrow.name} to ${tamerow.name} (\`lvl. ${tamerow.lvl} ${tamerow.species}\`).\n\n• Food +${fooditemrow.effectval}`
                        //updates the food value of the tame
                        sql.run(`UPDATE tames SET food = "${newfood}" WHERE name = "${tamerow.name}" AND userId = "${tamerow.userId}" AND time = "${tamerow.time}"`).catch(allerrors)
                        if(fooditemrow.effect == "Torpidity"){//adds torpidity if the item can apply some
                            //variable for storing the new torpidity and ensuring it doesn't exceed the maximum or drops below 0
                            let newtorp = tamerow.torp+fooditemrow.effectval > tamerow.maxtorp ? tamerow.maxtorp : tamerow.torp+fooditemrow.effectval < 0 ? 0 : tamerow.torp+fooditemrow.effectval
                            //adds the torpidity
                            sql.run(`UPDATE tames SET torp = "${newtorp}" WHERE name = "${tamerow.name}" AND userId = "${tamerow.userId}" AND time = "${tamerow.time}"`).catch(allerrors)
                            //variable to change the words in the confirmation message to either "increase" or "decrease", depending on what happened
                            let incordec = newtorp < tamerow.torp ? `-` : `+`
                            txt3 += `\n• Torpidity: ${incordec}${Math.abs(tamerow.torp-newtorp)}`
                        }
                        if(foodrow.amount <= 1){//if the user only has one item left, delete it
                            //deletes the item row
                            sql.run(`DELETE FROM useritems WHERE owner = "${msgauthid}" AND name = "${fooditemrow.name}"`).catch(allerrors)
                        }
                        else{//otherwise, remove 1
                            sql.run(`UPDATE useritems SET amount = "${foodrow.amount-1}" WHERE owner = "${msgauthid}" AND name = "${fooditemrow.name}"`).catch(allerrors)
                        }
                        //sends a confirmation message with the outcome
                        message.channel.send(txt3).catch(allerrors)
                    }
                })
                collector2.on('end', e => {
                    //deletes the bot's second message
                    msg2.delete().catch(allerrors)
                    //removes the users menu cooldown if the menu timed out or user fed suitable item
                    if(reacted2 < 1){removecooldown(`menu`, msgauthid)}
                })
            }
        })
        collector.on('end', e => {
            //deletes the bot's original message
            msg1.delete().catch(allerrors)
            //removes the users menu cooldown if the menu timed out
            if(reacted == 0){removecooldown(`menu`, msgauthid)}
        })
    }
}

else if (cmd == "pet"){
    //#region Pet commands
    //turning -pet into a new prefix and using new arguments
    let petargs = message.cleanContent.slice(config.petprefix.length).trim().split(/ +/g);
    let petcmd = petargs.shift().toLowerCase();

    //checks if the specified pet is in battle and return error message if it is
    let temprow = await sql.get(`SELECT * FROM pets WHERE owner = "${message.author.id}" AND name = ? COLLATE NOCASE`, `${petargs[0]}`)
    if(!temprow){/*Do nothing if no pet is found*/}
    else if(temprow.inbattle > getcurdate()) return errmsg(`This pet is currently in battle, please try again later.`).catch(allerrors)

    //────────── new command ──────────

    if(petcmd == "feed"){
        //returns error if no pet is specified
        if(!petargs[0]) return errmsg(`Please specify which pet you want to feed!`)

        //gets the pet's row
        let petrow = await sql.get(`SELECT * FROM pets WHERE owner = "${message.author.id}" AND name = ? COLLATE NOCASE`, petargs[0].toLowerCase()).catch(allerrors)
        //returns an error if the specified pet doesn't exist
        if(!petrow) return errmsg(`You don't have a pet called ${petargs[0]}!`)
        else if(petrow.ko == 1) return errmsg(`You can't feed an unconscious pet!`)

        //gets the creature row for diet
        let crrow = await sql.get(`SELECT * FROM creatures WHERE species = "${petrow.species}"`).catch(allerrors)
        //returns an error if the creature row isn't found
        if(!crrow) return errmsg(`There was an error accessing the creature data. Please try again.`)
        //returns error if no item is specified
        else if(!petargs[1]) return errmsg(`Please specify which item you want to feed!`)

        //gets the user's item row
        let uirow = await sql.get(`SELECT * FROM useritems WHERE owner = "${petrow.owner}" AND name = ? COLLATE NOCASE`, petargs[1].toLowerCase()).catch(allerrors)
        //returns an error if the user doesn't own the specified item
        if(!uirow) return errmsg(`You don't own an item called ${petargs[1]}!`)

        //gets the item row to check diet compatibility
        let irow = await sql.get(`SELECT * FROM items WHERE name = "${uirow.name}"`).catch(allerrors)
        //returns an error if the specified item isn't found
        if(!irow) return errmsg(`There was an error accessing the item data. Please try again.`)

        //variable for storing the amount of items the user uses
        let useditems = petargs[2]
        //if no valid item amount is specified, set it to 1
        if(useditems == undefined|| isNaN(useditems)){useditems = 1}
        //object storing which type of diet requires which food
        let dietobj = {
            Herbivore:[`Vegetation`],
            Omnivore:[`Vegetation`, `Meat`],
            Carnivore:[`Meat`]
        }
        //if the user tries to feed a non-food item, send an error message
        if(irow.category != "Food") return errmsg(`The specified item is not a food item!`)
        
        //if the user feeds more items than it takes to fill up the pet's food, set it to the required amount
        if(petrow.food+useditems*irow.effectval > petrow.maxfood){useditems = Math.ceil((petrow.maxfood-petrow.food)/irow.saturation)}
        //variable to edit the outcome if the item causes torpidity to rise, to display later
        let txt = ``
        //function to feed the pet
        async function feed(){
            //ensures no more items are used than the user owns
            useditems = useditems >= uirow.amount ? uirow.amount : useditems
            if(irow.effect == "Torpidity"){//if the used item causes torpidity
                if(irow.effectval*useditems >= petrow.maxtorpidity){//pet got knocked out
                    txt += `This item caused your pet to gain +${irow.effectval*useditems} torpidity, which knocked it out!`
                    //updates the pet's stats
                    sql.run(`UPDATE pets SET torpidity = "${petrow.maxtorpidity}", ko = "1", food = "${Math.round(petrow.food+useditems*irow.saturation)}" WHERE owner = "${petrow.owner}" AND name = "${petrow.name}"`).catch(allerrors)
                }
                else{//otherwise, add the torpidity
                    txt += `This item caused your pet to gain +${Math.round(irow.effectval*useditems)} torpidity.`
                    //updates the pet's stats
                    sql.run(`UPDATE pets SET torpidity = "${Math.round(petrow.torpidity+(irow.effectval*useditems))}", food = "${Math.round(petrow.food+useditems*irow.saturation)}" WHERE owner = "${petrow.owner}" AND name = "${petrow.name}"`)
                }
                //sends a confirmation message
                message.channel.send(botye+` You used ${useditems}x ${irow.name} to feed ${petrow.name} up to ${Math.round(petrow.food+useditems*irow.saturation)} / ${petrow.maxfood} food!\n${txt}`).catch(allerrors)
            }

            else{
                //updats the food stat 
                sql.run(`UPDATE pets SET food = "${Math.round(petrow.food+useditems*irow.saturation)}" WHERE owner = "${petrow.owner}" AND name = "${petrow.name}"`).catch(allerrors)
                //sends a confirmation message
                message.channel.send(botye+` You used ${useditems}x ${irow.name} to feed ${petrow.name} up to ${Math.round(petrow.food+useditems*irow.saturation)} / ${petrow.maxfood} food!\n${txt}`).catch(allerrors)
            }
            //if the user uses all items, delete the row
            if(useditems >= uirow.amount){sql.run(`DELETE FROM useritems WHERE owner = "${message.author.id}" AND name = "${irow.name}"`).catch(allerrors)}
            //otherwise just remove the amount
            else{sql.run(`UPDATE useritems SET amount = "${uirow.amount-useditems}" WHERE owner = "${message.author.id}" AND name = "${irow.name}"`).catch(allerrors)}
        }

        if(!dietobj[crrow.diet].includes(irow.type)){//user tries to feed item for another diet
            let msg1 = await message.channel.send(`<:exclm:510129890050179089> Are you sure you want to feed ${useditems}x ${irow.name} to ${petrow.name}? A ${crrow.diet}'s diet doesn't include ${irow.type}!\n\nType 'confirm' to confirm or 'cancel' to exit this menu.`).catch(allerrors)
            
            //variable to check if the user reacted
            let reacted = "n"
            //collects msgs from the message author for the next 60 seconds
            const collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 60000 });;
            collector.on('collect', async (message) => {
                let args2 = message.cleanContent.trim().split(/ +/g); //for getting the arguments in the new message
                if(args2[0] == "cancel"){reacted = "y"; collector.stop()}
                else if(args2[0] == "confirm"){
                    //ensures the bot knows the user reacted in time
                    reacted = "y"
                    //stops the collector
                    collector.stop()
                    //variable for storing the amount of damage the pet took
                    let dmg = Math.round(useditems*irow.saturation)
                    //updates the txt variable to inform the user the pet took damage
                    txt = `Your pet took ${dmg} damage from eating this item!\n`
                    //pet died:
                    if(petrow.health-dmg <= 0){
                        //damages the pet
                        await applydamage(petrow.name, petrow.owner, dmg, `eating the wrong food`)
                        //updates the txt variable with the outcome
                        txt += `${petrow.name} died from the damage caused!`
                        //sends a message informing the user of the outcome
                        message.channel.send(`You fed ${useditems}x ${irow.name} to ${petrow.name}! ${txt}`).catch(allerrors)
                        
                        //if the user uses all items, delete the row
                        if(useditems >= uirow.amount){sql.run(`DELETE FROM useritems WHERE owner = "${message.author.id}" AND name = "${irow.name}"`).catch(allerrors)}
                        //otherwise just remove the amount
                        else{sql.run(`UPDATE useritems SET amount = "${uirow.amount-useditems}" WHERE owner = "${message.author.id}" AND name = "${irow.name}"`).catch(allerrors)}
                    }
                    else{//pet survived
                        //damages the pet
                        await applydamage(petrow.name, petrow.owner, dmg)
                        //feeds the pet
                        feed()
                    }
                }
            })
            collector.on('end', async e =>{
                if(reacted == "n"){//user didn't react
                    //deleted the bot's first message
                    msg1.delete().catch(allerrors)
                    //informs the user that the menu timed out
                    message.channel.send(`<@${petrow.owner}> Exited menu.`).catch(allerrors)
                }
                //if the user reacted, just delete the first bot's message
                else{msg1.delete().catch(allerrors)}
            })
        }
        //user feeds the correct item
        else{
            feed()
        }
    }
    //────────── new command ──────────

    else if(petcmd == "list"){
        //#region Lists all pets
        //gets the names, species and levels of all pets 
        var petnames = []
        var petspecies = []
        var petlevels = []
        const rows = await sql.all(`SELECT * FROM pets WHERE owner = ?`, user.id)
            rows.forEach((row) => {
                petnames.push(row.name)
                petspecies.push(row.species)
                petlevels.push(row.lvl)
        })

        //defining the petlist embed for multiple reuse down below
        petlistembed = new Discord.RichEmbed()
            petlistembed.setTitle(`${user.username}'s Pets:`)
            for(i = 0; i <= (petnames.length-1); i++){
                petlistembed.addField(petnames[i], `${petspecies[i]} (Level \`${petlevels[i]}\`)\n⁣`, true)
                petlistembed.setThumbnail(user.avatarURL)
            }
            if(petnames.length == 0){petlistembed.addField(`This user doesn't have any pets!`, `Please try again later.`)}
            message.channel.send(petlistembed).catch(allerrors)
        //#endregion
    }

    //────────── new command ──────────

    else if(petcmd == "view" || petcmd == "show"){
        //variable for storing the user who's pet to check
        let user = !message.mentions.users.first() ? message.author : message.mentions.users.first()
        // --- checks if the user can use this command right now
        if(await checkcooldown(`inv`, message.author.id) > 0) return message.channel.send(botex+`Please wait **${await checkcooldown(`inv`, message.author.id)}s** before using this command!`).then(async(msg) => {await sleep(4000); msg.delete()}).catch(allerrors) 
        else {await newcooldown(`inv`, 15, message.author.id)}

        //#region Shows a specific pet
        // --- returns if no pet is specified or specified pet doesn't exist
        if(!petargs[0]) return message.channel.send(`${botno} Which pet do you want to view?`)
        let prow = await sql.get(`SELECT * FROM pets WHERE owner = "${user.id}" AND name = ? COLLATE NOCASE`, `${petargs[0].toLowerCase()}`).catch(allerrors)
        if(!prow) return errmsg(`${user.username} doesn't have a pet called ${capfirst(args[1])}!`).catch(allerrors)
        petname = prow.name

        // --- gets the creature row for the diet icon
        let crrow = await sql.get(`SELECT * FROM creatures WHERE species = "${prow.species}"`).catch(allerrors)
        if(!crrow) return errmsg(`There was an error accessing the species data. Please try again`).catch(allerrors)

        //sets the bots status to typing, so the user knows the command worked
        message.channel.startTyping()

        // --- checks if the pet can level up
        const curlevel = Math.floor(0.1*Math.sqrt(prow.xp))
        //levels up the pet
        if(prow.lvl < curlevel){await sql.run(`UPDATE pets SET lvl = "${curlevel}" WHERE owner = "${message.author.id}" AND name = "${petname}" COLLATE NOCASE`)}

        //updates the row to get the new values
        let row = await sql.get(`SELECT * FROM pets WHERE owner = "${user.id}" AND name = ? COLLATE NOCASE`, `${petargs[0].toLowerCase()}`).catch(allerrors)

        // --- loads the correct bars
        await loadpetbars(`health`, row.name, row.owner) //updates the health bar image
        await loadpetbars(`food`, row.name, row.owner) //updates the food bar image
        await loadpetbars(`happiness`, row.name, row.owner) //updates the happiness bar image

        // --- defines a variable for the path for storing the images
        path = user.id

        // --- creates the profile image
        var images = ["../Al-An/assets/menus/petprof.jpg", `../Al-An/assets/creatures/${row.species}/${row.skin}.png`, `../Al-An/assets/menus/menuimgs/${row.class}.png`, `../Al-An/assets/menus/menuimgs/${crrow.diet}.png`, `../Al-An/assets/menus/petprof_overlay.png`, `../Al-An/assets/bars/pets/xp.png`, `../Al-An/assets/bars/pets/xp_mask.png`, `../Al-An/assets/bars/pets/xp_bg.png`, `../Al-An/assets/bars/pets/background.png`, `../Al-An/assets/bars/pets/health.png`, `../Al-An/assets/bars/pets/food.png`, `../Al-An/assets/bars/pets/happiness.png`]
        var jimps = []
        for (var i = 0; i < images.length; i++){
            if(!fs.existsSync(images[i]) && images[i] != row.pic) return errmsg(`There was an error retrieving image data. Please try again.`).catch(allerrors)
            jimps.push(jimp.read(images[i]))
        }
        await Promise.all(jimps).then(function(data) {
            return Promise.all(jimps)
        }).then(async function(data){
            let rand = 0
            let base = 0
            data[0].resize(1280, 1280)
            switch(row.class){
                //sets various possible size ranges based on pet class for the pet image
                case'Small':     base = 550; rand = randomInt(50); break;
                case'Medium':    base = 655; rand = randomInt(50); break;
                case'Leviathan': base = 750; rand = randomInt(100); break;
            }

            //variables to scale the background image to the correct size:
            var lvldifxp = Math.pow(10*(row.lvl+1), 2)-Math.pow(10*row.lvl, 2)
            var relxp = row.xp - Math.pow(10*row.lvl, 2)
            var perc = relxp/lvldifxp
            var size = perc*220 + 20
            if(size < 50){size -= 20} //makes the image smaller at the start
            else if(size > 200){size += 20} //and bigger at the end
            if(size <= 0){size = 1} //makes sure the size doesn't get negative or zero

            // --- modify base images
            data[5].flip(false, true) //flip the xp image upside down so the maskign works
            data[5].resize(220, size) //resize the xp image
            data[5].mask(data[6], 0, 0) //mask the xp image so it's round
            data[7].composite(data[5], 0, 0) //add the xp image on the background
            data[7].flip(false, true) //flip it back over

            data[2].resize(75, 138) //resizes the class icon
            data[3].resize(75, 75)  //resizes the diet icon
            data[4].opacity(0.5)    //makes the overlay 50%

            //function for adding the different bars
            async function addbar(bar, x, y){
                //ensures the coordinates are defined
                if(x == undefined){x = 0}
                if(y == undefined){y = 0}
                //selects the correct stat
                let maxstat = bar == "food" ? `maxfood` : bar == "happiness" ? `maxhappiness` : `maxhealth`
                //variable to store the position in the image aray in
                let i = bar == "food" ? 10 : bar == "happiness" ? 11 : 9
                //variable to store the maximum bar size in
                let maxsize = 437
                //calculates the size
                let perc = Math.round((row[bar]/row[maxstat])*maxsize) //the percentage of max pixels to fill
                    //ensure the bar is never smaller than 5px or larger than the max
                    if(perc < 5) {perc = 5}
                    else if(perc > maxsize){perc = maxsize}
                    //resizes the bar
                    data[i].resize(perc, 20 )
                    //adds the bar on the image
                    data[0].composite(data[i], x, y)
            }

            // --- adds the bars
            await addbar("health", 295, 81)
            await addbar("food", 295, 138)
            await addbar("happiness", 295, 195)

            // --- change pet depending on skin
            if(row.skin == 0){
                base -= 100
                data[1].resize(base+rand, base+rand) //resizes the pet image
                randomInt(100)<50?data[1].flip(true, false): ``//50% chance to flip the image
                data[0].composite(data[1], 250+randomInt(400), 300+randomInt(300)) //adds the pet image in a random location
            }
            else{
                base += 100
                data[1].resize(base+rand, base+rand) //resizes the pet image
                data[0].composite(data[1], 300, 300)
            }
            // --- add all images together
            data[0].composite(data[3], 110, 515)//adds the diet icon
            data[0].composite(data[7], 36, 38)//adds the xp "bar"
            // --- add the pet
            switch(row.class){
                //changes icon locations for each class
                case'Small'     :data[0].composite(data[2], 112, 302); break; //adds the small class icon
                case'Medium'    :data[0].composite(data[2], 112, 303); break; //adds the medium class icon
                case'Leviathan' :data[2].resize(75, 130); data[0].composite(data[2], 112, 302); break; //adds and resizes the levitahan class icon
            }
            //adds a water overlay over the pet so it looks more realistic
            data[0].composite(data[4], 0, 0)

            await jimp.loadFont(`../Al-An/assets/fonts/Unisans_50.fnt`).then(async numfont => {
                    // --- prints all the values and text on the image
                    //loads a different font for the level
                    var levelfont = await jimp.loadFont(`../Al-An/assets/fonts/Unisans_150.fnt`)
                    //loads a different font for the small values on bars
                    var barfont = await jimp.loadFont(`../Al-An/assets/fonts/FuturaThin_20.fnt`)

                    // DISABLED prints the values on the bars
                    //data[0].print(barfont, 300, 56, {text: `${thousandize(row.health)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_TOP}, 0, 0)
                    //data[0].print(barfont, 690, 55, {text: `(${thousandize(row.maxhealth)})`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_TOP}, 0, 0)
                    //data[0].print(barfont, 300, 113, {text: `${thousandize(row.food)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_TOP}, 0, 0)
                    //data[0].print(barfont, 690, 112, {text: `(${thousandize(row.maxfood)})`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_TOP}, 0, 0)
                    //data[0].print(barfont, 300, 169, {text: `${thousandize(row.happiness)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_TOP}, 0, 0)
                    //data[0].print(barfont, 690, 168, {text: `(${thousandize(row.maxhappiness)})`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_TOP}, 0, 0)
                    //prints the other values
                    data[0].print(levelfont, 145, -30, {text: `${row.lvl}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                    data[0].print(numfont, 1075, 5, {text: `${row.attack}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                    data[0].print(numfont, 1075, 61, {text: `${row.shields}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                    data[0].print(numfont, 1075, 113, {text: `${thousandize(row.torpidity)}/${thousandize(row.maxtorpidity)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                    data[0].print(numfont, 1075, 171, {text: `${row.stamina}/${row.maxstamina}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                    //Scrapped, but needed later: data[0].print(bigfont, 170, 845, {text: row.passive == "None" ? `${row.passive}` : `${row.passive}﻿[${row.passiveval}]`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE}, 0, 0)
                })
                //resets the bots typing status
                message.channel.stopTyping()
                //passes the edited image to a buffer into an attachment
                var image = await new Discord.Attachment(await data[0].getBufferAsync(jimp.MIME_PNG))
                //sends a message with the image
                message.channel.send(`<:pet:507518997105737738>  __**${row.name}**__ <:invisible:503253527666229259><:invisible:503253527666229259><:invisible:503253527666229259><:invisible:503253527666229259><:invisible:503253527666229259> \`(Lvl. ${curlevel} ${row.species})\`\n${row.ko == 1 ? `(Unconscious)` : ``}`,image).catch(allerrors)
        })
        //#endregion
    }

    //────────── new command ──────────

    else if(petcmd == "stats"){
        // --- checks if the user is still on cooldown:
        if(await checkcooldown(`petstats`, message.author.id) > 0) return errmsg(`Please cool down! ${await checkcooldown(`petstats`, message.author.id)}s remaining`)
        else {await newcooldown(`petstats`, 5, message.author.id)}

        //checks if all neccessary arguments are provided
        if(!petargs[0]) return errmsg(`Which pet's stats do you want to view?`).catch(allerrors)
        //gets the row of the specified pet for the database
        const petrow = await sql.get(`SELECT * FROM pets WHERE owner = "${message.author.id}" AND name = ? COLLATE NOCASE`, `${petargs[0].toLowerCase()}`).catch(allerrors)
        //if the pet doesn't exist, send an error message
        if(!petrow) return errmsg(`You don't have a pet called ${capfirst(petargs[0])}!`).catch(allerrors)
        //gets the creature row for the diet
        let crrow = await sql.get(`SELECT * FROM creatures WHERE species = "${petrow.species}"`).catch(allerrors)
        //if the creature isnt found, send an error message
        if(!crrow) return errms(`An error occurred while accessing creature data. Please try again`)
        console.log(crrow)
        //creates a new embed for the stats:
        let statemb = new Discord.RichEmbed()
        .setColor(`#00E584`)
        .setTitle(`${petrow.name}'s stats`)
        .setThumbnail(crrow.pic)
        .setDescription(`**General:**\nSpecies: ${petrow.species}\nClass: ${petrow.class}\nDiet: ${crrow.diet}\n⁣`)
        .addField(`\`Health\``, `${petrow.health} / ${petrow.maxhealth}<:invisible:503253527666229259>`, true)
        .addField(`\`Food\``, `${petrow.food} / ${petrow.maxfood}<:invisible:503253527666229259>`, true)
        .addField(`\`Happiness\``, `${petrow.happiness} / ${petrow.maxhappiness}<:invisible:503253527666229259>`, true)
        .addField(`\`Strength\``, `${petrow.attack}\n+${petrow.torpiditydmg} torpor<:invisible:503253527666229259>`, true)
        .addField(`\`Shields\``, `${petrow.shields}<:invisible:503253527666229259>`, true)
        .addField(`\`Torpidity\``, `${petrow.torpidity} / ${petrow.maxtorpidity}<:invisible:503253527666229259>`, true)
        .addField(`\`Stamina\``, `${petrow.stamina} / ${petrow.maxstamina}`, true)
        .addField(`\`Level\``, `${petrow.lvl}`, true)

        //sends the embed
        message.channel.send(statemb).catch(allerrors)
    }

    //────────── new command ──────────

    else if(petcmd == "name"){
        // --- checks if the user is still on cooldown:
        if(await checkcooldown(`petname`, message.author.id) > 0) return errmsg(`Please cool down! ${await checkcooldown(`petname`, message.author.id)}s remaining`)
        else {await newcooldown(`petname`, 5, message.author.id)}

        //#region Lets people name their pet
        newname = petargs.slice(1).join(" ")
        petname = petargs[0]

        //checks if all neccessary arguments are provided
        if(!petargs[0]) return errmsg(`Which pet do you want to rename?`).catch(allerrors)
        else if(!petargs[1]) return merrmsg(`What do you want to rename it to?`).catch(allerrors)
        else if(petargs[1].toString() == null | petargs[1].toString() == undefined) return errmsg(`Please choose a valid name!`).catch(allerrors)
        const newpetrow = await sql.get(`SELECT * FROM pets WHERE owner = "${message.author.id}" AND name = ? COLLATE NOCASE`, newname)
        //checks if the user already has a pet with that name
        if(!newpetrow){
            //makes sure the name isn't too long
            if(newname.length > 12) return errmsg(`Please choose a shorter name!`).catch(allerrors)
            else if(newname.length < 2) return errmsg(`Please choose a longer name!`).catch(allerrors)
            const row = await sql.get(`SELECT * FROM pets WHERE owner = "${message.author.id}" AND name = ? COLLATE NOCASE`, `${petname.toLowerCase()}`)
            //checks if the user has a pet with the specified name
            if(!row) return message.channel.send(`${botno} You don't have a pet called ${capfirst(petname)}!`).catch(allerrors)
            else if(row.name.toLowerCase() == newname.toLowerCase()) return errmsg(`Your pet is already called **${capfirst(newname)}**`).catch(allerrors)
            
            sql.run(`UPDATE pets SET name = "${newname}" WHERE owner = "${message.author.id}" AND name = ? COLLATE NOCASE`, `${petname.toLowerCase()}`)
            message.channel.send(`${botye} **${row.name}** is now called **${newname}**!`).catch(allerrors)
        }
        else return errmsg(`You already have a pet called **${newname}**!`)
        //#endregion
    }

    //────────── new command ──────────

    else if(petcmd == "hunt"){
        //#region problemchecks, variables

        // --- gets all available locations from the database and adds them to a string
        let availablelocationsrow = await sql.all(`SELECT * FROM locations`)
        let availablelocations = ""
        availablelocationsrow.forEach((row) => {
                availablelocations = availablelocations + `\n${row.id}. ${row.name}`
            })
        
        // --- returns if pet or location is unspecified
        if(!petargs[0]) return errmsg(`Please specify the pet you want to take out hunting!`)
        else if (!petargs[1]) return errmsg(`Please specify the biome you want to hunt in!\n\n__Available locations:__\`\`\`md${availablelocations}\`\`\``)

        // --- gets the pet row
        let petname = petargs[0].toLowerCase() 
        var ownedpet = `SELECT * FROM pets WHERE owner = "${message.author.id}" AND name = ? COLLATE NOCASE`
        xplvlchange = "" //variable to display how much xp the pet gets, gets reset here to make sure it doesn't display an old value

        //checks if the specified location exists, checks for name, similar name and ID
        var locrow = await sql.get(`SELECT * FROM locations WHERE name = ? COLLATE NOCASE`, `${petargs[1].replace(/-/g, " ").toLowerCase()}`).catch(allerrors)
        if (!locrow) {
            locrow = await sql.get(`SELECT * FROM locations WHERE name LIKE ? COLLATE NOCASE`, `${petargs[1].replace(/-/g, " ").toLowerCase()}%`).catch(allerrors)
            if(!locrow) {
                locrow = await sql.get(`SELECT * FROM locations WHERE id = ?`, `${petargs[1]}`).catch(allerrors)
                if(!locrow) return errmsg(`That location doesn't exist! (**${petargs[1].replace(/-/g, " ").toLowerCase()}**)`)
            }
        }

        // --- gets the resources in the location
        let locresrows = await sql.all(`SELECT * FROM locres WHERE id = "${locrow.id}"`)
        // --- gets the encounters in the location
        let locencrows = await sql.all(`SELECT * FROM locenc WHERE id = "${locrow.id}"`)

        // --- checks if the pet exists
        var petrow = await sql.get(ownedpet, petname)
        var userrow = await sql.get(`SELECT * FROM users WHERE userId = "${message.author.id}"`)
        if(!petrow) return errmsg(`You don't have any pets called ${petargs[0]}!`)
        // --- checks if the pet can go hunting
        else if(petrow.ko == 1) return errmsg(botno+` ${petrow.name} is unconscious and can't go hunting!`)
        else if(petrow.stamina < petrow.stamina/10) return errmsg(`Your pet is too exhausted to go hunting! Let it rest first.`) //can't go hunting with less than 10% stamina
        else if(petrow.health < petrow.maxhealth/10) return errmsg(`Your pet is too hurt to go hunting! Take care of it first.`) //can't go hunting if the pet has less then 10% health
        // --- checks if the pet's level is high enough for the
        else if(petrow.lvl < locrow.lvl) return errmsg(`Your pet's level is not high enough to go hunting here!`) //can't go hunting if the pet can't access the location

        // --- if the user is not in the database, return
        if(!userrow) return errmsg(`An error occurred. Please try again.`)

        
        // --- checks if the user is still on cooldown:
        if(await checkcooldown(`hunt`, message.author.id) > 0) return errmsg(`You can't go hunting for another ${await checkcooldown(`hunt`, message.author.id)} seconds!`)
        else {await newcooldown(`hunt`, 30, message.author.id)}


        // --- adds all possible encounters to an array and chooses a random one
        var encounterlist = []
        locencrows.forEach((row) => {
            //adds each encounter as often as it's probability
            for(i=1;i<=row.chance;i++){
                encounterlist.push(row.name)
            }
        })
        //selects a random enounter for the biome
        var encounter = encounterlist[Math.floor(Math.random()*encounterlist.length)]

        // --- gets the encounter data
        let erow = await sql.get(`SELECT * FROM creatures WHERE species = "${encounter}" COLLATE NOCASE`)
        if(!erow) return errmsg(`Encounter not found. Please try again`).catch(allerrors)

        // TODO: add passives <-----------------------------------------------------------------------------------

        // --- this section determines a random enemy level
        
        let maxlevel = 15 //the maximum possible level
        let temp = 0 //temporary variable required for correct maths
        let chances = [] //the array of chances will be filled later
        let levels = [] //the array of possible levels will be filled later
        async function maths1(){
            //part 1 of acquiring the correct probabilities for each level
            for(i=0; i<=maxlevel; i++){
            temp = temp + (maxlevel-i+1)
            }
        }
        total = 0
        await maths1();
        for(x=0; x<=maxlevel; x++){
            //gets the correct probability for each level
            total=total+((maxlevel-x)+1)/temp
            //adds the probability to an array
            chances.push(((maxlevel-x)+1)/temp)
            //adds the level to another array
            levels.push(x)
        }

        let enemylvl = chanceobj.weighted(levels, chances) //random enemy level, the higher the level the more unlikely it is

        // --- three different xp "tiers" the pet can get depending on the hunt outcome:
        let badxp =  3   + randomInt(4) + petrow.lvl * (randomInt(2)-1) //increases xp slightly based on pet lvl
        let medxp =  10  + randomInt(6) + petrow.lvl * (randomInt(3)-1) //increases xp based on pet lvl
        let goodxp = 30  + randomInt(8) + petrow.lvl * (randomInt(5)-1) //increases xp greatly based on pet lvl

        for(x=0; x<=maxlevel; x++){
            for(i=0; i<=maxlevel; i++){((maxlevel-x)+1)/maxlevel-i+1}
        }

        // --- outcome embeds to display later:
        let bademb = new Discord.RichEmbed()
            .setColor(`FF7777`)
            .setTitle(botno+` Hunt failed`)
            .setThumbnail(petrow.pic)
        let goodemb = new Discord.RichEmbed()
            .setColor(`77FF77`)
            .setTitle(botye+` Hunt successful`)
            .setThumbnail(petrow.pic)
        let trashemb = new Discord.RichEmbed()
            .setColor(`FFF777`)
            .setTitle(`Hunt complete`)
            .setThumbnail(petrow.pic)
        let encemb = new Discord.RichEmbed()
            .setColor(`FF994F`)
            .setTitle(botex+` Enemy encountered`)
            .setDescription(`${petrow.name} encountered a **lvl. ${enemylvl} ${encounter}**!\n\nYou have 20 seconds to react!`)
            .setThumbnail(erow.pic)
        //#endregion
        //this variable determines if the hunt was good, bad or if any enemy was encountered (the higher, the better the result)
        var geb = 69//randomInt(100) + extraluck

        //different possible ways the hunt can end each have different probabilities:
        if(geb <= 10){
            //no hunting        | 10% |
            let lostemb = new Discord.RichEmbed()
            .setTitle(`You got lost!`)
            .setDescription(`You didn't manage to find the biome you were trying to hunt at!`)
            .setThumbnail(petrow.pic)
            message.channel.send(lostemb)
        }
        else if(geb <=30){
            //no loot           | 20% |
            await addxp(badxp, petrow.owner, petrow.name)
            await bademb.setDescription(`${petrow.name} didn't find or encounter anything interesting.${xplvlchange}`)
            message.channel.send(bademb).catch(allerrors)
        }
        else if(geb <= 60){
            //garbage loot      | 30% |
            //gets all location resource rows with the garbage tag
            let itemrows = await sql.all(`SELECT * FROM locres WHERE category = "Garbage"`)
            if(itemrows == ""){//if the location doesnt have garbage loot, return with info that nothing was found
                //adds xp to the pet
                await addxp(medxp, petrow.owner, petrow.name)
                //updates and sends the embed with the new info
                trashemb.setDescription(`${petrow.name} found nothing in the biome!${xplvlchange}`)
                return message.channel.send(trashemb).catch(allerrors)
            }
            //array for storing all items in the amount of their probability in
            let items = []
            for(i in itemrows){
                items.push(itemrows[i].name)
            }
            let item = items[Math.floor(Math.random()*items.length)]
            let amount = randomInt(5)
            newuseritem(amount, item, petrow.owner)
            await addxp(medxp, petrow.owner, petrow.name)

            trashemb.setDescription(`${petrow.name} found ${amount}x **${item}**.${xplvlchange}`)
            message.channel.send(trashemb).catch(allerrors)
        }
        else if(geb <= 70){
            //enemy encountered | 10% |
            let encmsg = await message.channel.send(encemb).catch(allerrors)

            //sets the pet's status to "in battle" for 15 min or until the fight ends so it can't be edited
            await sql.run(`UPDATE pets SET inbattle = "${getcurdate()+900}" WHERE owner = "${message.author.id}" AND name = "${petrow.name}"`).catch(allerrors)

            // --- defines emojis
            const pausemoji = bot.emojis.get("560094577394974721")
            const fightmoji = bot.emojis.get("560105843320815626")
            const escapemoji = bot.emojis.get("560103606808739851")

            // --- defines the encounter stats            
            let enemy_maxhealth =                   erow.health      //enemy maximum health before leveling to enemylvl
            let enemy_attack =                      erow.attack      //enemy strength before leveling to enemylvl
            let enemy_maxstamina =                  erow.stamina     //enemy maxstamina before leveling to enemylvl
            let enemy_shields = erow.shields > 0 ?  erow.shields : 0 //enemy shields before leveling to enemylvl
            let enemy_maxtorp = erow.maxtorpidity                    //enemy max torpidity before leveling to enemylvl
            let enemy_torpdmg = erow.torpiditydmg                    //enemy torpidity damage
            let enemy_torp = 0                                       //enemy torpidity starts at 0


            // --- levels up the enemy
            for(i=1; i<= enemylvl; i++){
                let stats = [`maxhealth`, `attack`, `maxstamina`, `maxtorp`]
                if(enemy_shields != 0){await stats.push(`shields`)}
                let stat = stats[Math.floor(Math.random()*stats.length)]

                switch(stat){
                    case'maxhealth':  {enemy_maxhealth  = enemy_maxhealth  + erow.maxhealthinc;    break;}
                    case'attack':     {enemy_attack     = enemy_attack     + erow.maxattackinc;    break;}
                    case'maxstamina': {enemy_maxstamina = enemy_maxstamina + erow.maxstaminainc;   break;}
                    case'maxtorp':    {enemy_maxtorp    = enemy_maxtorp    + erow.maxtorpidityinc; break;}
                    case'shields':    {enemy_shields    = enemy_shields    + erow.maxshieldsinc;   break;}
                }
            }
            let enemy_health = enemy_maxhealth    //enemy health after leveling maxhealth to enemylvl
            let enemy_stamina = enemy_maxstamina  //enemy stamina after leveling maxstamina to enemylvl

            //adds the reactions to the message
            encmsg.react(fightmoji).then(() => encmsg.react(escapemoji))
            
            //variable for determining if the user reacted
            var reacted = "n"
            //makes sure only the message author can react
            const filter = (reaction, user) => !user.bot && user.id == message.author.id;
            //collects reactions from the message author for the next 20 seconds
            let encountercollector = encmsg.createReactionCollector(filter, {time: 20000});

            encountercollector.on('collect', async (reaction, encountercollector) => {
                //determines which reaction the user chose
                const chosen = reaction.emoji.name;

                if(chosen=="escape"){
                    //user tried to escape

                    //checks if the pet has enough stamina to escape
                    if(petrow.stamina-1-Math.ceil(petrow.maxstamina/10) < 0) return encmsg.edit(encemb.setFooter(`❌ Your pet doesn't have enough stamina to escape! (${Math.ceil(petrow.maxstamina/10)} required)`)).catch(allerrors)
                    //compares creature levels
                    let lvldif = enemylvl>petrow.lvl ? (enemylvl-petrow.lvl)*2 : (petrow.lvl-enemylvl)*2
                    //compares creature categories
                    let categdif = 0
                    if(petrow.category      == "small"     && erow.category == "medium")    {categdif = 10}
                    else if(petrow.category == "medium"    && erow.category == "leviathan") {categdif = 10}
                    else if(petrow.category == "medium"    && erow.category == "small")     {categdif =-10}
                    else if(petrow.category == "leviathan" && erow.category == "medium")    {categdif =-10}
                    //personal category value
                    let petcategval = 0
                    if(petrow.category      == "small")      {petcategval = 10}
                    else if(petrow.category == "leviathan")  {petcategval =-10}

                    //determines if the pet could escape
                    let escapechance = randomInt(100) - lvldif + categdif + petcategval + (Math.round(petrow.stamina/petrow.maxstamina)*10) //if pet higher lvl/same or bigger category/small category/more stamina, higher chance
                    if(escapechance <= 50){
                        //didn't escape
                        if(enemy_attack>=petrow.health){
                            //pet 'died'
                            await kopet(message.author, petrow.name)

                            encmsg.edit(encemb.setDescription(`You tried to escape, but the enemy hit ${petrow.name} for ${enemy_attack} raw damage and knocked it out!${xplvlchange}`)).catch(allerrors)
                            encmsg.edit(encemb.setColor(`222222`)).catch(allerrors)
                        }
                        else{
                            //pet survived
                            sql.run(`UPDATE pets SET health = "${petrow.health-enemy_attack}" WHERE owner = "${message.author.id}" AND name = "${petrow.name}"`)
                            await addxp(badxp, message.author.id, petrow.name)

                            encmsg.edit(encemb.setDescription(`You tried to escape, but the enemy hit ${petrow.name} for ${enemy_attack} raw damage before leaving!${xplvlchange}`)).catch(allerrors)
                            encmsg.edit(encemb.setColor(`FF7777`)).catch(allerrors)
                        }
                    }
                    else if (escapechance > 50){
                        //escaped
                        await addxp(medxp, message.author.id, petrow.name)
                        encmsg.edit(encemb.setDescription(`You escaped! ${xplvlchange}`)).catch(allerrors)
                        encmsg.edit(encemb.setColor(`77FF77`)).catch(allerrors)
                    }

                    reacted = "y"
                    encountercollector.stop();
                }
                else if(chosen == "fight"){
                    // --- removes all reactions
                    await encmsg.clearReactions().catch(allerrors)
                    reacted = "y" //sets the variable to yes so the encountercolletor ending doesn't edit the embed
                    await encountercollector.stop(); //stops the first collector

                    //gets the enemy creature row for stats
                    let erow = await sql.get(`SELECT * FROM creatures WHERE species = "${encounter}" COLLATE NOCASE`)
                    //if the encounter isn't found, throw an error
                    if(!erow) return errmsg(`Encounter not found. Please try again`).catch(allerrors)

                    // --- adds random abilities to the enemy for every 5 levels
                    let abilityamount = Math.floor(enemylvl/5) > 3 ? 3 : Math.floor(enemylvl/5)
                    let ability1 = "None"
                    let ability2 = "None"
                    let ability3 = "None"
                    let possibleabilities = []
                    //gets all abilities the pet could theoretically have
                    let abilities = await sql.all(`SELECT * FROM abilities WHERE lvl <= ${enemylvl}`)
                    if(abilities == undefined || abilities == ``) return //if no abilities are deifned in the database, don't add any

                    //adds the name of all to the possible abilities array
                    for(i = 0; i <= abilities.length; i++){
                        //if no more abilities are available, skip adding more
                        if(abilities[i] != undefined){
                            possibleabilities.push(abilities[i].name)
                        }
                    }
                    for(i = 1; i<=abilityamount; i++){
                        //only change abilities, if the pet has at least one
                        if(abilityamount >= 1){
                            let chosen = ``
                            //chooses a random ability to be added, then removes it from the array
                            chosen = possibleabilities[Math.floor(Math.random() * possibleabilities.length)];
                            //removes the chosen ability from the array
                            possibleabilities = possibleabilities.filter(e => e !== chosen);
                            
                            switch(i){
                                case 1: {ability1 = chosen; break;}
                                case 2: {ability2 = chosen; break;}
                                case 3: {ability3 = chosen; break;}
                            }
                        }
                    }
                    
                    // --- adds fight to the database to store all values:
                    await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).then(async(row) =>{ //checks for old fights
                        await sql.run(`DELETE FROM fights WHERE user = "${petrow.owner}"`).catch(allerrors) //deletes any old fight rows
                        //adds new fight row to the database
                        sql.run(`INSERT INTO fights (user, pet, round, roundtime, enemy, ehealth, emaxhealth, eshields, eattack, estamina, emaxstamina, etorp, emaxtorp, etorpdmg, dmgmult, edmgmult, eability1, eability2, eability3, round1, round2, round3, round4, round5, round6, round7, round8, round9, round10, round11, round12, round13, round14, round15, round16, round17, round18, round19, round20, round21, round22, round23, round24, round25, round26, round27, round28, round29, round30) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, petrow.owner, petrow.name, 1, getcurdate()+22, encounter, enemy_health, enemy_maxhealth, enemy_shields, enemy_attack, enemy_stamina, enemy_maxstamina, enemy_torp, enemy_maxtorp, enemy_torpdmg, 1, 1, ability1, ability2, ability3, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``).catch(allerrors)
                    })
                    .catch(() => {sql.run(`CREATE TABLE IF NOT EXISTS fights (user INTEGER, pet TEXT, round INTEGER, roundtime INTEGER, enemy TEXT, ehealth INTEGER, emaxhealth INTEGER, eshields INTEGER, eattack INTEGER, estamina INTEGER, emaxstamina INTEGER, etorp INTEGER, emaxtorp TEXT, etorpdmg INTEGER, dmgmult INTEGER, edmgmult INTEGER, eability1 TEXT, eability2 TEXT, eability3 TEXT, round1 TEXT, round2 TEXT, round3 TEXT, round4 TEXT, round5 TEXT, round6 TEXT, round7 TEXT, round8 TEXT, round9 TEXT, round10 TEXT, round11 TEXT, round12 TEXT, round13 TEXT, round14 TEXT, round15 TEXT, round16 TEXT, round17 TEXT, round18 TEXT, round19 TEXT, round20 TEXT, round21 TEXT, round22 TEXT, round23 TEXT, round24 TEXT, round25 TEXT, round26 TEXT, round27 TEXT, round28 TEXT, round29 TEXT, round30 TEXT)`).then(() => {
                        sql.run(`INSERT INTO fights (user, pet, round, roundtime, enemy, ehealth, emaxhealth, eshields, eattack, estamina, emaxstamina, etorp, emaxtorp, etorpdmg, dmgmult, edmgmult, eability1, eability2, eability3, round1, round2, round3, round4, round5, round6, round7, round8, round9, round10, round11, round12, round13, round14, round15, round16, round17, round18, round19, round20, round21, round22, round23, round24, round25, round26, round27, round28, round29, round30) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, petrow.owner, petrow.name, 1, getcurdate()+22, encounter, enemy_health, enemy_maxhealth, enemy_shields, enemy_attack, enemy_stamina, enemy_maxstamina, enemy_torp, enemy_maxtorp, enemy_torpdmg, 1, 1, ability1, ability2, ability3, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``, ``).catch(allerrors)
                    })})
                    
                    // --- gets the fight row for values
                    let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)

                    // --- defines variables for the fight
                    let maxround = 30 //maximum number of rounds before the fight ends
                    let petname = petrow.name
                    let petowner = petrow.owner
                    let endfight = `n` //variable for figuring out when the fight should end (to prevent the embed from advbancing to the next round after fight is over)

                    //function for changing the recaps in the database
                    async function updaterecaps(recap, text){
                        //gets the fight row for current value
                        let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                        //changes the "author" based on the recap
                        let author = recap == `turnrecap` || recap == `nextroundrecap` ? `**[${frow.pet}]**` : `**[Enemy]**`
                        // --- changes either the current or next round
                        switch(recap){
                            case'turnrecap':
                            case'eturnrecap':{
                                //adds the text to the current round
                                sql.run(`UPDATE fights SET round${frow.round} = "${frow[`round`+frow.round]}\n${author} ${text}"`).catch(allerrors)
                                break;
                            }
                            case'nextroundrecap':
                            case'enextroundrecap':{
                                //adds the text to the next round
                                sql.run(`UPDATE fights SET round${frow.round+1} = "${frow[`round`+(frow.round+1)]}\n${author} ${text}"`).catch(allerrors)
                                break;
                            }
                            case`nextroundeffect`:{
                                //adds the effect recap to the next round (without author, since that is handeled in the fighteffect functon already)
                                sql.run(`UPDATE fights SET round${frow.round+1} = "${frow[`round`+(frow.round+1)]}\n${text}"`).catch(allerrors)
                                break;
                            }
                        }
                    }

                    // --- collector for during the fight (defined here to exitfight can stop it)
                    //makes sure only the message author can react
                    const filter = (reaction, user) => !user.bot && user.id == message.author.id;
                    //collects reactions from the message author for the next 33 miuntes
                    let fightcollector = encmsg.createReactionCollector(filter, {time: 2000099});

                    //function for removing stamina from the pet or enemy
                    async function drainstamina(pet, petowner, target, amount){
                        //removes stamina from the pet
                        if(target == `pet`){
                            //gets the pet row for the current stamina amount
                            let petrow = await sql.get(`SELECT * FROM pets WHERE name = "${pet}" AND owner = "${petowner}"`).catch(allerrors)
                            //if the reduced stamina would be negative, only subtract the remaining stamina
                            if(petrow.stamina-amount < 0){amount = petrow.stamina}
                            //subtracts the stamina
                            sql.run(`UPDATE pets SET stamina = ${Math.round(petrow.stamina-amount)}`).catch(allerrors)
                        }
                        //removes stamina from the pet
                        else if(target == `enemy`){
                            //gets the fight row for the enemies stamina amount
                            let frow = await sql.get(`SELECT * FROM fights WHERE pet = "${pet}" AND petowner = "${petowner}"`).catch(allerrors)
                            //if the reduced stamina would be negative, only subtract the remaining stamina
                            if(frow.estamina-amount < 0){amount = frow.estamina}
                            //subtracts the stamina
                            sql.run(`UPDATE fights SET estamina = "${Math.round(frow.estamina-amount)}"`).catch(allerrors)
                        }
                    }
                    //function for adding stamina to the pet or enemy
                    async function addstamina(pet, petowner, target, amount){
                        //adds stamina to the pet
                        if(target == `pet`){
                            //gets the pet row for the current stamina amount
                            let petrow = await sql.get(`SELECT * FROM pets WHERE name = "${pet}" AND owner = "${petowner}"`).catch(allerrors)
                            //if the added stamina would be more than total, set to total
                            if(petrow.stamina+amount < petrow.maxstamina){amount = petrow.maxstamina-petrow.stamina}
                            //adds the stamina
                            sql.run(`UPDATE pets SET stamina = ${Math.round(petrow.stamina+amount)}`).catch(allerrors)
                        }
                        //adds stamina to the pet
                        else if(target == `enemy`){
                            //gets the fight row for the enemies stamina amount
                            let frow = await sql.get(`SELECT * FROM fights WHERE pet = "${pet}" AND petowner = "${petowner}"`).catch(allerrors)
                            //if the added stamina would be more than total, set to total
                            if(frow.estamina+amount > frow.emaxstamina){amount = frow.emaxstamina-frow.estamina}
                            //adds the stamina
                            sql.run(`UPDATE fights SET estamina = "${Math.round(frow.estamina+amount)}"`).catch(allerrors)
                        }
                    }
                    //function to add all necessary reactions
                    async function fightreactions(){
                        //if the user is taming, don't mess with reactions
                        if(endfight == "taming") return
                        // --- clears old reactions
                        await encmsg.clearReactions().catch(allerrors)
                        // --- reacts with all possible actions
                        encmsg.react(fightmoji).then(() => encmsg.react(pausemoji).then(async() => {
                            await encmsg.react(escapemoji);
                            // --- gets all abilities the pet has
                            let rows = await sql.all(`SELECT * FROM userabilities WHERE pet = "${petrow.name}" AND petowner = "${message.author.id}"`)
                            // --- doesnt do anything if the pet has no abilities
                            if(rows == "") return
                            // --- cycles through all abiities the pet has and adds them as reactions
                            else{rows.forEach(async(row) => {
                                //gets the name of the ability
                                let abrow = await sql.get(`SELECT * FROM abilities WHERE name = "${row.name}"`) //gets the ability row for the emoji ID
                                if(!abrow) return //doesn't do anything if no ability is found
                                //looks for an emoji with that ID and reacts with it if found
                                encmsg.react(bot.emojis.get(abrow.emojiid)).catch(allerrors)
                                })
                            }
                        }))
                    }
                    // --- function that's called for ending the fight
                    async function exitfight(result){
                        // --- gets the pet row from the database
                        let petrow = await sql.get(ownedpet, petname)
                        let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                        if(result == "eko"){
                            //starts taming process if the enemy is ko instead of showing default end screen
                            endfight = "taming"
                            return fightcollector.stop()
                        }

                        endfight = "y" //tells the embed updater to stop

                        //changes xp amount based on outcome
                        switch(result){
                            //for knocking out or killing the enemy, add good xp
                            case`eko`:
                            case`win`: await addxp(goodxp, message.author.id, petrow.name); break;
                            //for a tie add a little xp
                            case`tie`: await addxp(medxp, message.author.id, petrow.name); break;
                            //for fleeing, a loss or being knocked out, add minimal xp
                            case`flee`: await addxp(badxp, message.author.id, petrow.name); break;
                            case`ko`:
                            case`defeat`: await addxp(badxp, message.author.id, petrow.name); break;
                        }

                        // --- creates a new embed
                        femb = new Discord.RichEmbed()
                        .setTitle(`Fight over!`)
                        .setThumbnail(`https://i.imgur.com/ln2EYpy.png`)
                        //changes the description based on the outcome
                        .setDescription((`${petrow.name} fought a **lvl. ${enemylvl} ${encounter}** ${result == `draw` ? `to a draw` : result == `win` ? `and won` : result == "defeat" ? `and lost` : result == "ko" ? `and was knocked out` : result == "eko" ? `and knocked out the enemy` : `and escaped`}!\n\nYour pet gained ${result == `draw` ? `some` : result == `win` || result == `eko` ? `a lot of` : `a little`} experience!\n${xplvlchange}\n⁣`))
                        //adds the roundrecap (what happened last round)
                        if(frow[`round`+frow.round] == `` || frow.round-1 < 1){/*If no round recap is defined or this is the first round, it doesn't add anything*/}
                        else{femb.addField(`Round ${frow.round-1}:`, `${frow[`round`+frow.round]}\n⁣`)}
                        if(frow[`round`+(frow.round+1)] == ``){/*If no next round recap is defined it doesn't add anything*/}
                        else{femb.addField(`Round ${frow.round}:`, `${frow[`round`+(frow.round+1)]}\n⁣`)}
                        //adds the stats
                        femb.addField(`${petrow.name}'s stats:`, `<:health:503148983917608971> Health: ${petrow.health} (${petrow.maxhealth})\n<:shields:503149009142022144> Shields: ${petrow.shields}\n<:attack:560103116989661211> Strength: ${petrow.attack}\n<:stamina:559102664080752640> Stamina: ${petrow.stamina}\n<:torpor:698554042271531011> Torpidity: ${petrow.torpidity} (${petrow.maxtorpidity})\n⁣`, true)
                        femb.addField(`Wild ${encounter}'s stats:`, `<:health:503148983917608971> Health: ${frow.ehealth} (${frow.emaxhealth})\n<:shields:503149009142022144> Shields: ${frow.eshields}\n<:attack:560103116989661211> Strength: ${frow.eattack}\n<:stamina:559102664080752640> Stamina: ${frow.estamina}\n<:torpor:698554042271531011> Torpidity: ${frow.etorp}/${frow.emaxtorp}\n⁣`, true)
                        //edits the message with the new embed
                        encmsg.edit(femb).catch(allerrors)
                        //stops the reaction collector
                        fightcollector.stop()
                    }
                    //function for adding, removing or clearing torpor of the pet or enemy
                    async function torpor(action, pet, petowner, target, amount){
                        //gets the pet row for the current torpor amount
                        let petrow = await sql.get(`SELECT * FROM pets WHERE name = "${pet}" AND owner = "${petowner}"`).catch(allerrors)
                        //gets the fight row for the enemies torpor amount
                        let frow = await sql.get(`SELECT * FROM fights WHERE pet = "${pet}" AND user = "${petowner}"`).catch(allerrors)
                        switch(action){
                            //if torpor is being added
                            case'add':{
                                if(target == "pet"){name
                                    // --- pet is the target:
                                    //if the added torpor would exceed the maximum, set it to the maximum
                                    if(petrow.torpidity + amount >= petrow.maxtorpidity){amount = petrow.maxtorpidity}
                                    else{amount = petrow.torpidity+amount}
                                    //sets the torpor
                                    sql.run(`UPDATE pets SET torpidity = "${amount}" WHERE name = "${pet}" AND owner = "${petowner}"`).catch(allerrors)
                                    //if the pet is ko, end the fight and knock it out
                                    if(amount == petrow.maxtorpidity){
                                        //ends the fight
                                        await exitfight(`ko`)
                                        //sets the ko status of the pet
                                        sql.run(`UPDATE pets SET ko = "1" WHERE name = "${petrow.name}" AND owner = "${petrow.owner}"`).catch(allerrors)
                                    }
                                }
                                else{
                                    // --- enemy is the target:
                                    //if the removed torpor would be less than 0, set it to 0
                                    if(frow.etorp + amount > frow.emaxtorp){amount = frow.emaxtorp}
                                    else{amount = frow.etorp+amount}
                                    //sets the torpor
                                    sql.run(`UPDATE fights SET etorp = "${amount}" WHERE pet = "${pet}" AND user = "${petowner}"`).catch(allerrors)
                                    //if the enemy is ko, end the fight and go into taming
                                    if(amount == frow.emaxtorp){await exitfight(`eko`)}
                                }
                                break;
                            }
                            //if torpor is being removed
                            case'remove':{
                                if(target == "pet"){
                                // --- pet is the target:
                                //if the removed torpor would be less than 0, set it to 0
                                if(petrow.torpidity - amount < 0){amount = 0}
                                else{amount = petrow.torpidity-amount}
                                //sets the torpor
                                sql.run(`UPDATE pets SET torpidity = "${amount}" WHERE name = "${pet}" AND owner = "${petowner}"`).catch(allerrors)
                                }
                                else{
                                    // --- enemy is the target:
                                    //if the removed torpor would be less than 0, set it to 0
                                    if(frow.torp - amount < 0){amount = 0}
                                    else{amount = frow.torp-amount}
                                    //sets the torpor
                                    sql.run(`UPDATE fights SET etorp = "${amount}" WHERE pet = "${pet}" AND user = "${petowner}"`).catch(allerrors)
                                }
                                break;
                            }
                            //if torpor is being cleared
                            case'clear':{
                                if(target == "pet"){
                                    // --- pet is the target:
                                    //sets the torpor
                                    sql.run(`UPDATE pets SET torpidity = 0 WHERE name = "${pet}" AND owner = "${petowner}"`).catch(allerrors)
                                }
                                else{
                                    // --- enemy is the target:
                                    //sets the torpor
                                    sql.run(`UPDATE fights SET etorp = 0 WHERE pet = "${pet}" AND user = "${petowner}"`).catch(allerrors)
                                }
                                
                                break;
                            }
                        }
                    }
                    // --- defines the fight embed
                    let femb = new Discord.RichEmbed()
                    // --- function to change embed contents (adds round, stats, etc.)
                    async function updateembed(round){
                        if(round > maxround || isNaN(round)) return exitfight(`draw`, `Fight is over!`)//ends the fight after the last round

                        if(endfight == "y") return encmsg.clearReactions().catch(allerrors) //doesn't update the embed if the fight is over but removes all reactions
                        else if(endfight == "taming") return //doesn't do anything if it moves to taming

                        // --- gets the pet and fight row from the database
                        petrow = await sql.get(ownedpet, petname)
                        let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)

                        // --- creates a new embed
                        femb = new Discord.RichEmbed()
                        .setTitle(`Round ${round}`)
                        .setThumbnail(`https://i.imgur.com/ln2EYpy.png`)
                        .setDescription((`${petrow.name} encountered a **lvl. ${enemylvl} ${encounter}**!\n\n__It's your turn!__ You can:\n\n• attack normally (deals damage amounting to your pet's total strength)\n• pause (heals 10% of your pet's max health & regenerates stamina)\n• escape (if successful, fight ends)\n• use an ability\n⁣`))
                        //adds the roundrecap (what happened last round) and nextround effects (e.g. pet is bleeding, so takes damage at the start of the next round)
                        if(frow[`round`+(frow.round-1)] == `` || frow.round == 1){/*If no round recap is defined or this is the first round it doesn't add anything*/}
                        else{femb.addField(`Round ${round-1}:`, `${frow[`round`+(frow.round-1)]}\n⁣`)}
                        if(frow[`round`+frow.round] == ``){/*If no info for the next round is defined, it leaves it out*/}
                        else{femb.addField(`Round ${round}:`, `${frow[`round`+frow.round]}\n⁣`)}
                        //adds the stats
                        femb.addField(`${petrow.name}'s stats:`, `<:health:503148983917608971> Health: ${petrow.health} (${petrow.maxhealth})\n<:shields:503149009142022144> Shields: ${petrow.shields}\n<:attack:560103116989661211> Strength: ${petrow.attack}\n<:stamina:559102664080752640> Stamina: ${petrow.stamina}\n<:torpor:698554042271531011> Torpidity: ${petrow.torpidity} (${petrow.maxtorpidity})\n⁣`, true)
                        femb.addField(`Wild ${encounter}'s stats:`, `<:health:503148983917608971> Health: ${frow.ehealth} (${frow.emaxhealth})\n<:shields:503149009142022144> Shields: ${frow.eshields}\n<:attack:560103116989661211> Strength: ${frow.eattack}\n<:stamina:559102664080752640> Stamina: ${frow.estamina}\n<:torpor:698554042271531011> Torpidity: ${frow.etorp}/${frow.emaxtorp}\n⁣`, true)
                        //edits the embed
                        encmsg.edit(femb).catch(allerrors)
                        //adds the fight reactions
                        await fightreactions()
                    }
                    // --- updates the embed
                    await updateembed(frow.round)

                    // --- function for advancing the round and clearing confusion
                    async function updateround(round){
                        //doesn't do anything if the round number is not a number
                        if(isNaN(round)) return
                        //gets the fight row for stats
                        let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                        if(!frow) return // sql.run(`UPDATE fights SET round = "End" WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`)

                        //updates the round
                        sql.run(`UPDATE fights SET round = "${round}" WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                        //if the pet or enemy was confused this round, remove one round from the time
                        if(frow.petconfusion > 0){sql.run(`UPDATE fights SET petconfusion = "${petconfusion-1}"WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)}
                        if(frow.econfusion > 0){sql.run(`UPDATE fights SET econfusion = "${petconfusion-1}"WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)}
                    }
                    //function to heal the pet or enemy
                    async function heal(target, amount){
                        //ensures there are no decimals
                        amount = Math.round(amount)
                        //gets the pet row for values
                        let petrow = await sql.get(ownedpet, petname)
                        //gets the fight row for values
                        let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)

                        switch(target){
                            case`pet`:{
                                // --- pet gets healed
                                //if the pet would gain more health than it's maximum allows, make sure it only heals up to the max
                                if(amount+petrow.health > petrow.maxhealth){amount = petrow.maxhealth-petrow.health}
                                //adds the health
                                await sql.run(`UPDATE pets SET health = "${petrow.health+amount}" WHERE name = "${petrow.name}" AND owner = "${petrow.owner}"`).catch(allerrors)
                                break;
                            }
                            case`enemy`:{
                                // --- enemy gets healed
                                //if the enemy would gain more health than it's maximum allows, make sure it only heals up to the max
                                if(amount+frow.ehealth > frow.emaxhealth){amount = frow.emaxhealth-frow.ehealth}
                                //adds the health
                                await sql.run(`UPDATE fights SET ehealth = "${frow.ehealth+amount}" WHERE pet = "${petrow.name}" AND user = "${petrow.owner}"`).catch(allerrors)
                                break;
                            }
                        }
                    }
                    //function to apply damage to the pet or enemy
                    async function damage(target, amount, type){
                        //gets the pet row for values
                        let petrow = await sql.get(ownedpet, petname)
                        //gets the fight row for values
                        let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                        //updates the pet and enemy defense variable so they're up to date
                        let petdef = petrow.health+petrow.shields
                        let edef = frow.ehealth+frow.eshields

                        //applies or resets damage multipliers
                        if(target == "pet" && type != "ranged"){amount = Math.ceil(amount*frow.dmgmult)} //changes damage depending on the pet's damage multiplier (NOT FOR RANGED DAMAGE)
                        else if(target == "enemy" && type != "ranged"){amount = Math.ceil(amount*frow.edmgmult)} //changes damage depending on the enemies damage multiplier (NOT FOR RANGED DAMAGE)
                        //if the multipliers were changed last round, change them back
                        if(frow.dmgmult != 1){sql.run(`UPDATE fights SET dmgmult = "1" WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)} //resets the damage multiplier for the pet
                        if(frow.edmgmult != 1){sql.run(`UPDATE fights SET edmgmult = "1" WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)} //resets the damage multiplier for the enemy
                        
                        //rounds the damage to ensure no .5s, etc
                        amount = Math.round(amount)
                        //do different things for each different type of damage
                        switch(type.toLowerCase()){
                            case'melee':{
                                //applies normal damage
                                if(target == `pet`){
                                    //end fight if pet is killed
                                    if(petdef-amount<=0) {
                                        //sets the pets health to 0 and exits the fight
                                        await sql.run(`UPDATE pets SET health = "0" WHERE owner = "${petrow.owner}" AND name = "${petrow.name}"`).catch(allerrors)
                                        await exitfight(`defeat`, frow.roundrecap, frow.nextround)
                                    }
                                    //applies damage if pet survives
                                    else {sql.run(`UPDATE pets SET health = "${petdef-amount}" WHERE owner = "${petrow.owner}" AND name = "${petrow.name}"`).catch(allerrors)}
                                }
                                else if(target == `enemy`){
                                    //end fight if enemy is killed
                                    if(edef-amount<=0){
                                        //sets the enemy health to 0 and exits the fight
                                        await sql.run(`UPDATE fights SET ehealth = "0" WHERE user = "${petrow.owner}"`).catch(allerrors)
                                        await exitfight(`win`, frow.roundrecap, frow.nextround)
                                    }
                                    //applies damage if enemy survives
                                    else {sql.run(`UPDATE fights SET ehealth = "${edef-amount}" WHERE user = "${petrow.owner}"`).catch(allerrors)}
                                }
                                break;
                            }
                            case'raw':{
                                //applies raw damage (shields don't count)
                                if(target == `pet`){
                                    //end fight if pet is killed
                                    if(petrow.health-amount<=0) {
                                        //sets the pets health to 0 and exits the fight
                                        await sql.run(`UPDATE pets SET health = "0" WHERE owner = "${petrow.owner}" AND name = "${petrow.name}"`).catch(allerrors)
                                        await exitfight(`defeat`, frow.roundrecap, frow.nextround)
                                    }
                                    //applies damage if pet survives
                                    else {sql.run(`UPDATE pets SET health = "${petrow.health-amount}" WHERE owner = "${petrow.owner}" AND name = "${petrow.name}"`).catch(allerrors)}
                                }
                                else if(target == `enemy`){
                                    //end fight if enemy is killed
                                    if(frow.ehealth-amount<=0) {
                                        //sets the enemy health to 0 and exits the fight
                                        await sql.run(`UPDATE fights SET ehealth = "0" WHERE user = "${petrow.owner}"`).catch(allerrors)
                                        await exitfight(`win`, frow.roundrecap, frow.nextround)
                                    }
                                    //applies damage if enemy survives
                                    else {sql.run(`UPDATE fights SET ehealth = "${frow.ehealth-amount}" WHERE user = "${petrow.owner}"`).catch(allerrors)}
                                }
                                break;
                            }
                            case'ranged':{
                                //applies ranged damage (ignores damage multipliers)
                            }
                            //if the defined type is something else, throw an error message in chat
                            default:{errmsg(`Unknown damage type "${type}"`)}
                        }
                    }
                    async function updateroundtime(seconds){
                        //adds 20 seconds to the current roundtime
                        await sql.run(`UPDATE fights SET roundtime = "${getcurdate()+seconds}" WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                    }
                    //function for applying any effects the pet or enemy might have (only counts effects that were added in the last 10 mins to avoid old effects that weren't removed for some reason)
                    async function fighteffects(){
                        //variable stores the current date in seconds
                        let nowtime = getcurdate()
                        //deletes all old effects or effects which expired
                        await sql.run(`DELETE FROM usereffects WHERE isfighteffect = "true" AND createdat < ${nowtime-600}`)
                        await sql.run(`DELETE FROM usereffects WHERE isfighteffect = "true" AND time <= 0`)
                        
                        //gets ALL effects from the current fight
                        let usreffrows = await sql.all(`SELECT * FROM usereffects WHERE pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat >= ${nowtime-600}`)
                        //if no effects are found, don't do anything
                        if(!usreffrows || usreffrows == undefined) return

                        // --- goes through all effects to apply and update them
                        for(row of usreffrows){
                            //updates the fight row to get the newest values and recaps
                            let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)

                            //gets the effect row for effect type and descriptions
                            let effrow = await sql.get(`SELECT * FROM effects WHERE name = "${row.name}"`).catch(allerrors)
                            //throws an error if the effect isnt found
                            if(!effrow) return errmsg("There was an error accessing the effect. Sorry about that.")
                            
                            //variable to determine which "author" to display on the effect recap
                            let author = row.target == "pet" ? frow.pet : "Enemy"
                            //variable stores the maxhealth of the target
                            let targetmaxhealth = row.target == `pet` ? petrow.maxhealth : frow.emaxhealth
                            //variable stores the maxstamina of the target
                            let targetmaxstamina = row.target == `pet` ? petrow.maxstamina : frow.emaxstamina
                            //variable stores the maxstamina of the target
                            let targetmaxtorpidity = row.target == `pet` ? petrow.maxtorpidity : frow.emaxtorp

                            //variable to store the healing & damage amount in, changes if it's %-based on target maxhealth
                            let valuehealth = row.strength < 1 ? Math.round(targetmaxhealth*row.strength) : row.strength
                            //variable to store the stamina amount in, changes if it's %-based on target maxstamina
                            let valuestam = row.strength < 1 ? Math.round(targetmaxstamina*row.strength) : row.strength
                            //variable to store the torpidity amount in, changes if it's %-based on target maxtorp
                            let valuetorp = row.strength < 1 ? Math.round(targetmaxtorpidity*row.strength) : row.strength
                            //ensures the effect does NOT do nothing
                            if(valuehealth < 1){valuehealth = 1}
                            if(valuestam < 1){valuestam = 1}

                            switch(effrow.type){
                                //if the effect is a damaging effect:
                                case'damage':{
                                    //applies the effect damage to the target WHY YOU NO DO DIS
                                    await damage(row.target, valuehealth, effrow.dmgtype)
                                    //sets the nextturnrecap to inform the player of the effect's effects (replaces placeholders with actual numbers)
                                    await updaterecaps(`nextroundeffect`, `${effrow.fightdesc.replace(`TARGET`, `**[${author}]**`).replace(`DMGAMOUNT`, `${valuehealth}`)}`)
                                    //removes one round from the effect duration if the effect remains for at least one more round
                                    await sql.run(`UPDATE usereffects SET time = ${row.time-1} WHERE name = "${row.name}" AND pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat = "${row.createdat}" AND time > 1`).catch(allerrors)
                                    //removes the effect if this was the last round
                                    await sql.run(`DELETE FROM usereffects WHERE name = "${row.name}" AND pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat = "${row.createdat}" AND time <= 1`).catch(allerrors)
                                    break;
                                }
                                //if the effect is a healing effect
                                case'healing':{
                                    //applies the effect healing to the target WHY YOU NO DO DIS
                                    await heal(row.target, valuehealth)
                                    //sets the nextturnrecap to inform the player of the effect's effects (replaces placeholders with actual numbers)
                                    await updaterecaps(`nextroundeffect`, `${effrow.fightdesc.replace(`TARGET`, `**[${author}]**`).replace(`HEALTHAMOUNT`, `${valuehealth}`)}`)
                                    //removes one round from the effect duration if the effect remains for at least one more round
                                    await sql.run(`UPDATE usereffects SET time = ${row.time-1} WHERE name = "${row.name}" AND pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat = "${row.createdat}" AND time > 1`).catch(allerrors)
                                    //removes the effect if this was the last round
                                    await sql.run(`DELETE FROM usereffects WHERE name = "${row.name}" AND pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat = "${row.createdat}" AND time <= 1`).catch(allerrors)
                                    break;
                                }
                                //if the effect is a stamina effect
                                case'stamina':{
                                    //applies the effect stamina to the target WHY YOU NO DO DIS
                                    //await heal(row.target, valuestam)
                                    //sets the nextturnrecap to inform the player of the effect's effects (replaces placeholders with actual numbers)
                                    await updaterecaps(`nextroundeffect`, `${effrow.fightdesc.replace(`TARGET`, `**[${author}]**`).replace(`STAMINAAMOUNT`, `${valuestam}`)}`)
                                    //removes one round from the effect duration if the effect remains for at least one more round
                                    await sql.run(`UPDATE usereffects SET time = ${row.time-1} WHERE name = "${row.name}" AND pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat = "${row.createdat}" AND time > 1`).catch(allerrors)
                                    //removes the effect if this was the last round
                                    await sql.run(`DELETE FROM usereffects WHERE name = "${row.name}" AND pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat = "${row.createdat}" AND time <= 1`).catch(allerrors)
                                    break;
                                }
                                //if the effect is a torpidity effect
                                case'torpor':{
                                    //applies the effect torpor to the target WHY YOU NO DO DIS
                                    await torpor("add", petrow.name, petrow.owner, row.target, valuetorp)
                                    //sets the nextturnrecap to inform the player of the effect's effects (replaces placeholders with actual numbers)
                                    await updaterecaps(`nextroundeffect`, `${effrow.fightdesc.replace(`TARGET`, `**[${author}]**`).replace(`TORPORAMOUNT`, `${valuestam}`)}`)
                                    //removes one round from the effect duration if the effect remains for at least one more round
                                    await sql.run(`UPDATE usereffects SET time = ${row.time-1} WHERE name = "${row.name}" AND pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat = "${row.createdat}" AND time > 1`).catch(allerrors)
                                    //removes the effect if this was the last round
                                    await sql.run(`DELETE FROM usereffects WHERE name = "${row.name}" AND pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat = "${row.createdat}" AND time <= 1`).catch(allerrors)
                                    break;
                                }
                                //if the effect is of another type
                                case'utility':{
                                    //checks which effect it is
                                    if(effrow.name == "Confusion"){
                                        //sets the nextturnrecap to inform the player of the effect's effects (replaces placeholders with actual numbers)
                                        await updaterecaps(`nextroundeffect`, `${effrow.fightdesc.replace(`TARGET`, `**[${author}]**`).replace(`ROUNDSAMOUNT`, `${effrow.time}`)}`)
                                        //removes one round from the effect duration if the effect remains for at least one more round
                                        await sql.run(`UPDATE usereffects SET time = ${row.time-1} WHERE name = "${row.name}" AND pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat = "${row.createdat}" AND time > 1`).catch(allerrors)
                                        //removes the effect if this was the last round
                                        await sql.run(`DELETE FROM usereffects WHERE name = "${row.name}" AND pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat = "${row.createdat}" AND time <= 1`).catch(allerrors)
                                    }
                                }
                            }
                        }
                    }
                    //advances the round every 20 seconds if the user doesn't react earlier
                    async function roundtimer(){
                        //gets the fighht row from the database to check if the round is supposed to update yet
                        let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                        //only advances the round every 20 seconds
                        if(getcurdate()>=frow.roundtime){
                            // --- advances the round
                            //updates the time to the next round to in 20 seconds
                            await updateroundtime(20)
                            //updates the recap
                            await updaterecaps(`turnrecap`, `You didn't react in time!`)
                            //starts the enemie's round
                            await enemyround()
                        }
                    }
                    //function for the enemy actions and applying effects at the round start
                    async function enemyround(){
                        if(endfight == "y") return //doesn't do the enemy round if the fight is over
                        //gets the pet row
                        let petrow = await sql.get(`SELECT * FROM pets WHERE name = "${petname}" AND owner = "${petowner}"`).catch(allerrors)
                        //gets the fight row
                        let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                        //defines the pets and enemies defense value
                        let petdef = petrow.health+petrow.shields
                        let edef = frow.ehealth+frow.eshields

                        //function to end this round, update the recaps and embed
                        async function endround(){
                            //applies any effects the pet or enemy might have next round
                            await fighteffects()
                            //advances the round
                            await updateround(frow.round+1)
                            //updates the embed
                            await updateembed(frow.round+1)
                        }
                        
                        //arrays for storing basic info about the abilities to determine which one to use
                        let abilitytypes = []
                        let abilitydmgs = []
                        let abilityeffects = []
                        //goes through each ability and adds the most important information to the arrays
                        for(i = 1; i <= abilityamount; i++){
                            //variable to determine which damage type to use (changes depending on the pet class)
                            let type = petrow.class == "Small" ? `dmgs` : petrow.class == "Medium" ? `dmgm` : `dmgl`
                            //determines which ability is being checked
                            switch(i){
                                case 1:{
                                    let row = await sql.get(`SELECT * FROM abilities WHERE name = "${frow.eability1}"`)
                                    //adds the abilitytype, damage and effects to the arrays
                                    abilitytypes.push(row.type)
                                    abilitydmgs.push(row[type])
                                    abilityeffects.push(row.effect)
                                    break;
                                }
                                case 2:{
                                    let row = await sql.get(`SELECT * FROM abilities WHERE name = "${frow.eability2}"`)
                                    //adds the abilitytype, damage and effects to the arrays
                                    abilitytypes.push(row.type)
                                    abilitydmgs.push(row[type])
                                    abilityeffects.push(row.effect)
                                    break;
                                }
                                case 3:{
                                    let row = await sql.get(`SELECT * FROM abilities WHERE name = "${frow.eability3}"`)
                                    //adds the abilitytype, damage and effects to the arrays
                                    abilitytypes.push(row.type)
                                    abilitydmgs.push(row[type])
                                    abilityeffects.push(row.effect)
                                    break;
                                }
                            }
                        }
                        
                        //determines the enemies next action based of the enemies and the pet's stats: 
                        let decision = randomInt(100)
                        //arrays to store possibilities for stamina recoveries, health recoveries and surviving
                        let randomstaminas = ["ability pause", "pause"];
                        let randomheals = ["ability healing", "pause"]
                        let randomsurvives = ["escape", "pause"]
                        //selects a random way to get stamina, health and to survive
                        let randomstamina = randomstaminas[Math.floor(Math.random() * randomstaminas.length)]
                        let randomheal = randomheals[Math.floor(Math.random() * randomheals.length)]
                        let randomsurvive = randomsurvives[Math.floor(Math.random() * randomsurvives.length)]

                        //decides what the enemy does
                        if(frow.estamina < 1){randomstamina} //if the enemy is out of stamina, pause or use a stamina ability (random)
                        else if(petdef <= frow.eattack){decision = "attack"} //if the enemy can kill the pet normally next round, attack
                        else if(frow.estamina-1-Math.ceil(frow.emaxstamina/10) < 0){decision = randomstamina} //if the enemy has less than 10% stamina, pause or use stamina ability
                        else if(edef <= petrow.attack && decision <= 50){decision = "pause"} //if the enemy could get killed next round either pause to heal and get damage reduction or try to escape (random)
                        else if(frow.ehealth <= frow.emaxhealth/10){decision = randomheal} //if the enemy has less than 10% of health, pause or use healing ability (random)
                        else if(decision <= 40){decision = "ability damage"} //otherwise either use a damaging ability,
                        else if((decision <= 60 && frow.estamina != frow.emaxstamina) || (decision <= 5 && frow.ehealth != frow.emaxhealth)){decision = "pause"} //pause if either stamina or health aren't full
                        else{decision = "attack"} //or attack (with probabilities: 40%, 20%, 40%)

                        // --- checks if the enemy can use abilities
                        //gets all effects fron the current fight for the enemy
                        let ueffrows = await sql.all(`SELECT * FROM usereffects WHERE pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat >= ${getcurdate()-600} AND target = "enemy"`)
                        //goes through all effects
                        for(row in ueffrows){
                            //if the effect is confusion, and the enemy wants to use one, don't allow it
                            if(row.name == "Confusion" && row.time >= 1 && decision.startsWith() == "ability"){
                                //if enemy wants to use damage or torpor ability, change it to attack
                                if(decision == "ability damage" || decision == "ability healing"){decision = "attack"}
                                //if enemy wants to use healing or stamina ability, change it to pause
                                else if(decision == "ability healing" || decision == "ability stamina"){decision = "pause"}
                                //for all other abilities, change it to attack
                                else{decision = "attack"}
                            }
                        }

                        let stamreq = 0
                        switch(decision){ //adds a stamina requirement to attacking and escaping to check if the action can be performed
                            case'attack':   {stamreq = 1; break;} //attacking requires 1 stamina
                            case'escape':   {stamreq = Math.ceil(frow.emaxstamina/10);  break;} //escaping requires 10% stamina
                            default:        {stamreq = 0; break;} //other stamina requirements are handeled below
                        }
                        if(frow.estamina < stamreq){
                            //if the enemy can't perform the selected action, it attacks if it has at least 1 stamina left, or otherwise pauses
                            if(frow.estamina >= 1){decision = "attack"}
                            else{decision = "pause"}
                        }

                        // --- determines which ability exactly the enemy uses
                        let chosenability = ``
                        async function chooseability(){
                            //variable for storing the ability the enemy chooses
                            //gets all abilities the pet has with the delected ability typs
                            let possibleabilities = await sql.all(`SELECT * FROM abilities WHERE (name = "${frow.eability1}" OR name = "${frow.eability2}" OR name =  "${frow.eability3}") AND type = "${decision.slice(8)}" COLLATE NOCASE`)
                            //if the enemy has no abilities with the selected type, just attack or pause normally
                            if(possibleabilities == `` || possibleabilities == undefined) {decision = decision.slice(8).toLowerCase() == "damage" ? `attack` : decision.slice(8).toLowerCase() == `` ?  decision : decision.slice(8).toLowerCase() == `stamina` ? `pause` :  `pause`}
                            //chooses a random ability with the selected type
                            else {chosenability = possibleabilities[randomInt(possibleabilities.length)-1].name}

                            //gets the ability row of the chosen ability for stats
                            let abrow = await sql.get(`SELECT * FROM abilities WHERE name = "${chosenability}" COLLATE NOCASE`)
                            //if it cant find the ability, just attack or pause normally
                            if(!abrow) return decision = decision.slice(8).toLowerCase() == "damage" ? `attack` : decision.slice(8).toLowerCase() == `` ?  decision : `pause`

                            //if the enemy doesnt have abilities or can't use them, attack
                            let confrow = await sql.get(`SELECT * FROM usereffects WHERE pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat >= ${getcurdate()-600} AND target = "enemy" AND name = "Confusion"`)
                            if(frow.eability1 == "None" || decision == "ability" && confrow != undefined){decision = "attack"}

                            // --- checks if the pet is a valid target for this ability:
                            else if(decision == "ability"){
                                let abilitytargets = abrow.useableon.split(' ') //adds all words in the "useable on" category to an array
                                //changes decision to just attacking / pausing if the ability can't be used on the pet class
                                if(!abilitytargets.includes(petrow.class)) return decision = decision.slice(8).toLowerCase() == "damage" ? `attack` : decision.slice(8).toLowerCase() == `` ?  decision : `pause`

                                //checks the stamina requirement to see if the enemy can use the ability
                                let staminareq = 0
                                if(abrow.stamina < 1){
                                    //if the stamina req is smaller than 1, use it as %-based
                                    staminareq = Math.ceil(abrow.stamina*frow.emaxstamina)
                                    if(frow.estamina < staminareq) return decision = "pause"
                                }
                                else{
                                    //otherwise subtract the total stamina amount
                                    staminareq = frow.estamina
                                    if(frow.estamina < staminareq) return decision = "pause"
                                }
                            }
                        }
                        //chooses the ability
                        await chooseability()

                        //acts out the enemies decision
                        switch(decision){
                            case'attack':{//enemy attacks normally
                                //applies the pet's damage multiplier to the enemy damage
                                let dmg = frow.eattack*frow.dmgmult

                                //checks if the pet survived
                                if(petdef > dmg){
                                    // --- pet survived:
                                    if(petrow.shields >= dmg){
                                        // --- the shields blocked all damage
                                        //updates the enemy recap
                                        await updaterecaps(`eturnrecap`, `The enemy tried to attack, but your pet's shields blocked all ${Math.round(dmg)} melee damage.`)
                                    }
                                    else{
                                        // --- the pet took some damage:
                                        //adds an additional info to the recap if the enemy has shields
                                        let shieldstring = petrow.shields > 0 ? `, ${petrow.shields} of which were blocked by it's shields` : ``
                                        //updates the enemy recap
                                        await updaterecaps(`eturnrecap`, `The enemy hit ${petrow.name} for ${Math.round(dmg)} melee damage${shieldstring}.`)
                                        //adds the damage to the pet
                                        await damage(`pet`, Math.round(dmg), "melee")
                                        //adds the torpor to the pet
                                        await torpor(`add`, petrow.name, petrow.owner, `pet`, erow.torpiditydmg)
                                    }
                                    //ends this round
                                    endround();

                                }
                                else{
                                    //pet died:
                                    //adds an additional info to the recap if the enemy has shields
                                    let shieldstring = petrow.sshields > 0 ? `, ${petrow.shields} of which were blocked by it's shields` : ``
                                    //updates the enemy recap
                                    await updaterecaps(`eturnrecap`,`The enemy attacked and dealt ${Math.round(dmg)} melee damage${shieldstring} and killed your pet!`)
                                    //gets the fight row for the new recaps
                                    let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                                    //advances the round
                                    await updateround(frow.round+1)
                                    await exitfight(`defeat`)
                                }
                                break;
                            }
                            case'escape':{//enemy tries to escape
                                //compares creature levels
                                let lvldif = enemylvl<petrow.lvl ? (petrow.lvl-enemylvl)*2 : (enemylvl-petrow.lvl)*2
                                //compares creature categories
                                let categdif = 0
                                if(erow.category ==      "small"     && petrow.category == "medium")    {categdif =-10}
                                else if(erow.category == "medium"    && petrow.category == "leviathan") {categdif =-10}
                                else if(erow.category == "medium"    && petrow.category == "small")     {categdif = 10}
                                else if(erow.category == "leviathan" && petrow.category == "medium")    {categdif = 10}
                                //personal category value
                                let ecategval = 0
                                if(erow.category      == "small")      {ecategval = 10}
                                else if(erow.category == "leviathan")  {ecategval =-10}

                                //determines if the enemy could escape
                                let escapechance = randomInt(100) - lvldif + categdif + ecategval + (Math.round(frow.estamina/frow.emaxstamina)*10) //if enemy higher lvl/same or bigger category/small category/more stamina, higher chance
                            
                                if(escapechance <= 50){
                                    // --- couldn't escape
                                    //assigns frow to a temporary variable because it would get blocked for some reason otherwise
                                    let frowtemp = frow

                                    if(petrow.attack*frow.edmgmult >= frow.ehealth){
                                        // --- enemy died
                                        //updates the recaps
                                        await updaterecaps(`eturnrecap`, `The enemy tried to escape, but your pet caught up, hit it for ${Math.round(petrow.attack*frowtemp.edmgmult)} raw damage and killed it!`)
                                        //applies the damage
                                        await damage(`enemy`, petrow.attack, `raw`)
                                        //advances the round
                                        await updateround(frowtemp.round+1)
                                    }
                                    else{
                                        // --- enemy survived
                                        //applies the damage
                                        await damage(`enemy`, petrow.attack, `raw`)
                                        //removes stamina from the enemy
                                        await sql.run(`UPDATE fights SET estamina = "${frow.estamina-frow.emaxstamina/10}" WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                                        //updates the recaps
                                        await updaterecaps(`eturnrecap`, `The enemy tried to escape but your pet caught up and hit it for ${Math.round(petrow.attack*frow.edmgmult)} raw damage!`)
                                        //ends the current round
                                        endround()
                                    }
                                }
                                else if(escapechance > 50){
                                    //escaped
                                    await updaterecaps(`eturnrecap`, `The enemy escaped!`)
                                    //gets the fight row for the new recaps
                                    let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                                    //advances the round
                                    await updateround(frow.round+1)
                                    //gets the fight row for the new recaps
                                    let frow1 = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                                    //ends the fight
                                    await exitfight(`win`)
                                }
                                break;
                            }
                            case'pause':{//enemy pauses
                                frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                                //calculates the new health & stamina if the enemy isn't full already
                                let plushealth = Math.ceil(frow.emaxhealth/10)
                                let plusstam = Math.ceil(frow.emaxstamina/100)
                                if(frow.ehealth + plushealth > frow.emaxhealth){plushealth = frow.emaxhealth-frow.ehealth}
                                if(frow.estamina + plusstam > frow.emaxstamina){plusstam = frow.emaxstamina-frow.estamina}
                                //changes the turnrecap
                                //updates the enemy recap
                                await updaterecaps(`eturnrecap`, `The enemy paused to heal ${plushealth} health and regenerate ${plusstam} stamina! They will have 50% damage reduction when attacked close-range next round.`)
                                //updates the fight row with the new health, stamina and damage multiplier
                                await sql.run(`UPDATE fights SET ehealth = "${frow.ehealth+plushealth}", estamina = "${frow.estamina+plusstam}", edmgmult = "0.5" WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                                //ends the current round
                                endround();
                                break;
                            }
                            default:{//enemy uses ability

                                //gets the ability row of the chosen ability for stats
                                let abrow = await sql.get(`SELECT * FROM abilities WHERE name = "${chosenability}" COLLATE NOCASE`)
                                //if it cant find the ability, just attack or rest normally
                                if(!abrow) return decision = decision.slice(8).toLowerCase() == "damage" ? `attack` : decision.slice(8).toLowerCase() == `` ?  decision : `pause`

                                //gets the enemy row
                                let erow = await sql.get(`SELECT * FROM creatures WHERE species = "${encounter}" COLLATE NOCASE`)

                                // --- change damage depending on pet class
                                let dmgamount = 0
                                switch(petrow.class){
                                    case`Small`:    {dmgamount = abrow.dmgs; break;}
                                    case`Medium`:   {dmgamount = abrow.dmgm; break;}
                                    case`Leviathan`:{dmgamount = abrow.dmgl; break;}
                                }
                                // --- changes gained health based on enemy class
                                let healthamount = 0
                                switch(erow.class){
                                    case`Small`:    {healthamount = abrow.healths; break;}
                                    case`Medium`:   {healthamount = abrow.healthm; break;}
                                    case`Leviathan`:{healthamount = abrow.healthl; break;}
                                }
                                //if the ability heals the enemy, add the health and change the eturnrecap
                                let healingstring = ``
                                if(healthamount > 0){
                                    //heals the enemy
                                    await heal("enemy", frow.emaxhealth*healthamount)
                                    //changes the eturnrecap
                                    healingstring = `, healed themselves for ${Math.round(frow.emaxhealth*healthamount)} HP`
                                }
                                // --- adds the damage amount to the recap if the ability deals damage
                                function dmgstring(dmg){ //returns either an empty string or 
                                    return dmgamount > 0 ? ` and hit your pet for ${dmg*frow.dmgmult} ${abrow.dmgtype.toLowerCase()} damage` : ``
                                }

                                //multiply damage amount with base damage (because ability damage is %-based)
                                // --- changes the enemies turnrecap
                                switch(abrow.dmgtype){
                                    //in case the damage type is raw:
                                    case'raw': {
                                        //pet survived
                                        if(dmgamount<petrow.health){
                                            await updaterecaps(`eturnrecap`, `The enemy used their ${chosenability} ability${healingstring}${dmgstring(Math.round(frow.eattack*dmgamount))}!`)
                                        }
                                        //pet died
                                        else{await updaterecaps(`eturnrecap`, `The enemy used their ${chosenability} ability${healingstring} and killed your pet by dealing ${Math.round(frow.eattack*dmgamount)} raw damage!`)}
                                        
                                        //damages the pet with the ability  (dasmage is %-based, so multiply with normal damage first, then round to get a clean value)
                                        await damage(`pet`, Math.round(frow.eattack*dmgamount), abrow.dmgtype)
                                        break;
                                    }
                                    //in case the damage type is melee or ranged:
                                    default: {
                                        //pet survived
                                        if(Math.round(frow.eattack*dmgamount) < petrow.shields + petrow.health){
                                            //pet shields absorbed all damage:
                                            if(Math.round(frow.eattack*dmgamount) <= petrow.shields){await updaterecaps(`eturnrecap`, `The enemy used their ${chosenability} ability${healingstring} and dealt ${Math.round(frow.eattack*dmgamount)} ${abrow.dmgtype} damage, but ${petrow.name}'s shields absorbed all of it!`)}
                                            //pet took some damage:
                                            else{
                                                //adds an additional info to the recap if the pet has shields
                                                let shieldstring = petrow.shields > 0 && dmgamount > 0 ? `, ${petrow.shields} of which were blocked by your pet's shields` : ``
                                                //updates the enemies turnrecap
                                                await updaterecaps(`eturnrecap`, `The enemy used their ${chosenability} ability${healingstring}${dmgstring(Math.round(frow.eattack*dmgamount))}${shieldstring}!`)
                                                //damages the pet with the ability (dasmage is %-based, so multiply with normal damage first, then round to get a clean value)
                                                await damage(`pet`, Math.round(frow.eattack*dmgamount), abrow.dmgtype)
                                            }
                                        }
                                        //pet died
                                        else{
                                            //adds an additional info to the recap if the pet has shields
                                            let shieldstring = petrow.shields > 0 ? `, ${petrow.shields} of which were blocked by your pet's shields` : ``
                                            await updaterecaps(`eturnrecap`, `The enemy used their ${chosenability} ability${healingstring} and killed your pet by dealing ${Math.round(frow.eattack*dmgamount)} ${abrow.dmgtype} damage${shieldstring}!`)
                                            //damages the pet with the ability (dasmage is %-based, so multiply with normal damage first, then round to get a clean value)
                                            await damage(`pet`, Math.round(frow.eattack*dmgamount), abrow.dmgtype)
                                        }
                                        break;
                                    }
                                }

                                if(abrow.effect.toLowerCase() != "none"){
                                    // --- if the ability has a special effect, apply it and change the eturnrecap

                                    //updates the fight row to get the newest values
                                    let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                                    //variable for figuring out the correct damage depending on pet size
                                    let effstrength = petrow.class == "small" ? abrow.specialvals : petrow.class = "medium" ? abrow.specialvalm : abrow.specialvall

                                    //gets the effect row for damage type
                                    let effrow = await sql.get(`SELECT * FROM effects WHERE name = "${abrow.effect}" COLLATE NOCASE`)
                                    //if the effect isnt found, send an error message
                                    if(!effrow) return errmsg("An error occurred! (Effect not found)\nPlease report it to Aci!")

                                    //adds the effect to the enemy
                                    await addeffect(petrow.name, petrow.owner, abrow.effect, effrow.type, abrow.rounds, `pet`, effstrength, "true")
                                    //adds the effect info to the turnrecap (replaces placeholder text with actual amount of rounds)
                                    await updaterecaps(`eturnrecap`, ` ${effrow.applydesc.replace(`ROUNDSAMOUNT`, `${abrow.rounds}`).replace(`TARGET`, petrow.name)}`)
                                }
                                //ends the current round
                                endround();
                                break;
                            }
                        }
                    }
                    //runs the roundtimer function every second
                    let advanceround = setInterval(function(){roundtimer()}, 1000)

                    //checks for reactions during the fight
                    fightcollector.on('collect', async (reaction, fightcollector) => {
                        //determines which reaction the user chose
                        const chosen = reaction.emoji.name;
                        //updates the pet row to get the newest values
                        let petrow = await sql.get(ownedpet, petname)
                        //updates the fight row to get the newest values
                        let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)

                        //if this was the last round, exit fight as a tie
                        if(frow.round+1 > maxround) return exitfight(`draw`);

                        if(chosen == "fight"){
                            // --- user attacks normally

                            //checks if the pet has enough stamina to fight
                            if(petrow.stamina < 1) return encmsg.edit(femb.setFooter(`❌ ${petrow.name} doesn't have enough stamina to attack. (1 required)`)).catch(allerrors)

                            //updates the roundtimer so the round doesn't advance on it's own
                            await updateroundtime(20)

                            //changes the roundrecap depending on the outcome
                            if(frow.ehealth+frow.eshields > frow.edmgmult*petrow.attack){
                                // --- enemy didn't take damage
                                if(frow.eshields >= petrow.attack*frow.edmgmult){
                                    //changes the turnrecap
                                    await updaterecaps(`turnrecap`, `hit the enemy for ${petrow.attack*frow.edmgmult} damage, but the enemies shields blocked all of it!`)
                                }
                                // --- enemy took damage and survived:
                                else{
                                    //adds an additional info to the recap if the enemy has shields
                                    let shieldstring = frow.eshields > 0 ? `, ${frow.eshields} of which were blocked by it's shields` : ``
                                    //changes the turnrecap
                                    await updaterecaps(`turnrecap`, `hit the enemy for ${petrow.attack*frow.edmgmult} damage${shieldstring}!`)
                                    //applies damage to enemy
                                    await damage(`enemy`, petrow.attack, `melee`)
                                }
                            }
                            //enemy died
                            else{
                                //adds an additional info to the recap if the enemy has shields
                                let shieldstring = frow.eshields > 0 ? `, ${frow.eshields} of which were blocked by it's shields` : ``
                                //changes the turnrecap
                                await updaterecaps(`turnrecap`, `attacked the enemy for ${petrow.attack*frow.edmgmult} damage${shieldstring} and killed it!`)
                                //applies damage to enemy
                                await damage(`enemy`, petrow.attack, `melee`)
                            }
                            //removes the stamina from the pet
                            await drainstamina(petrow.name, petrow.owner, `pet`, 1)
                            //applies torpor to enemy
                            await torpor(`add`, petrow.name, petrow.owner, `enemy`, petrow.torpiditydmg)
                            //starts the enemy round
                            await enemyround()
                        }
                        else if(chosen == "pause"){
                            // --- user rests
                            
                            //updates the roundtimer so the round doesn't advance on it's own
                            await updateroundtime(20)

                            //calculates the health to add based on the pet's max health
                            let newhealth = Math.ceil(petrow.maxhealth/10)
                            //calculates the stamina to add based on the pet's max stamina
                            let newstam = Math.ceil(petrow.maxstamina/100)
                            //sets the health and stamina to their maximum, if they would exceed it.
                            if(petrow.health+newhealth > petrow.maxhealth) {newhealth = petrow.maxhealth-petrow.health}
                            if(petrow.stamina + newstam > petrow.maxstamina){newstam = petrow.maxstamina-petrow.stamina}
                            //changes the turnrecap to include the pause and regenerated amounts
                            await updaterecaps(`turnrecap`, `${petrow.name} paused to heal ${newhealth} health and regenerate ${newstam} stamina. They will have 50% damage reduction when attacked close-range next round.`)

                            //updates the pet and fight row with the new health, stamina and damage multiplier so the pet takes less damage next round
                            await sql.run(`UPDATE pets SET health = "${petrow.health+newhealth}", stamina = "${petrow.stamina+newstam}" WHERE name = "${petrow.name}" AND owner = "${message.author.id}"`).catch(allerrors)
                            await sql.run(`UPDATE fights SET dmgmult = "0.5" WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`)
                            
                            //starts the enemy round
                            await enemyround()
                        }
                        else if(chosen == "escape"){
                            // --- user tries to escape
                            //checks if the pet has enough stamina to escape (10% required)
                            if(petrow.stamina < Math.ceil(petrow.maxstamina/10)) return encmsg.edit(encemb.setFooter(`❌ Your pet doesn't have enough stamina to escape! (${Math.ceil(petrow.maxstamina/10)} required)`)).catch(allerrors)
                            
                            //updates the roundtimer so the round doesn't advance on it's own
                            await updateroundtime(20)

                            // --- This section ensures that the smaller the pet and the larger the enemy is, the greater the chance to escape is. The lower the pet's level and the higher the enemies is, the smaller the chance to escape is. The more stamina the pet has, the higher it's chance to escape is.
                            //compares creature levels to change escape chance
                            let lvldif = enemylvl>petrow.lvl ? (enemylvl-petrow.lvl)*2 : (petrow.lvl-enemylvl)*2
                            //compares creature categories to change escape chance
                            let categdif = 0
                            if(petrow.category ==      "small"     && erow.category == "medium")    {categdif = 10}
                            else if(petrow.category == "medium"    && erow.category == "leviathan") {categdif = 10}
                            else if(petrow.category == "medium"    && erow.category == "small")     {categdif =-10}
                            else if(petrow.category == "leviathan" && erow.category == "medium")    {categdif =-10}
                            //personal category value changes escape chance
                            let petcategval = 0
                            if(petrow.category      == "small")      {petcategval = 10}
                            else if(petrow.category == "leviathan")  {petcategval =-10}

                            //determines if the pet could escape. 
                            let randomnum = randomInt(100)
                            let escapechance = randomnum - lvldif + categdif + petcategval + (Math.round(petrow.stamina/petrow.maxstamina)*10) //if the pet is a higher lvl, the same or a bigger category, in the small category or has more stamina, the chance to escape increases

                            if(escapechance <= 50){
                                // --- didn't escape
                                if(frow.eattack*frow.dmgmult>=petrow.health){
                                    // --- pet 'died'
                                    //updates the turn recap
                                    await updaterecaps(`turnrecap`, `Your pet tried to escape, but the enemy hit ${petrow.name} for ${frow.eattack*frow.dmgmult} raw and killed it! Tried escaping with ${Math.round((escapechance/50)*100)}%`)
                                    //removes the stamina from the pet
                                    await drainstamina(petrow.name, petrow.owner, `pet`, Math.ceil(petrow.maxstamina/10))
                                    //advances the round
                                    await updateround(frow.round+1)
                                    //ends the fight
                                    await exitfight(`defeat`)
                                }
                                else{
                                    // --- pet survived
                                    //sets the pet's health to the new value
                                    await damage(`pet`, frow.eattack*frow.dmgmult, `raw`)
                                    //updates the turn recap
                                    await updaterecaps(`turnrecap`, `Your pet tried to escape, but the enemy caught up and hit ${petrow.name} for ${frow.eattack*frow.dmgmult} raw damage! Tried escaping with ${Math.round((escapechance/50)*100)}%`)

                                    //removes the stamina from the pet
                                    await drainstamina(petrow.name, petrow.owner, `pet`, Math.ceil(petrow.maxstamina/10))
                                    //starts the enemy round
                                    await enemyround()
                                }
                            }
                            else if (escapechance > 50){
                                // --- escaped
                                //updates the turn recap
                                await updaterecaps(`turnrecap`, `**[${petrow.name}]** escaped with ${Math.round((escapechance/50)*100)}%`)

                                //updates the fight row to get the newest recaps
                                let frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                                await exitfight(`flee`)
                            }
                        }
                        else{
                            // --- if pet cant use abilities, display a error message (confusion stops the use of abilities)
                            //if the enemy doesnt have abilities or can't use them, attack
                            let confrow = await sql.get(`SELECT * FROM usereffects WHERE pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND isfighteffect = "true" AND createdat >= ${getcurdate()-600} AND target = "pet" AND name = "Confusion"`)
                            if(confrow != undefined && confrow.time >= 1) return encmsg.edit(femb.setFooter(`❌ Your pet can't use abilities for ${confrow.time} more round(s).`)).catch(allerrors)

                            // --- create an empty array to store ability names in
                            let petabilities = []
                            let abilityrows = await sql.all(`SELECT * FROM userabilities WHERE pet = "${petrow.name}" AND petowner = "${petrow.owner}"`)
                            abilityrows.forEach((row) => {
                                //adds every abilityname to the array
                                petabilities.push(row.name)
                            })
                            // --- checks if the used reaction is one of the abilities
                            if(petabilities.includes(capfirst(chosen))){
                                // --- user used an ability:

                                //gets the enemy row
                                let erow = await sql.get(`SELECT * FROM creatures WHERE species = "${encounter}" COLLATE NOCASE`)

                                //gets the ability row for basic specs
                                let abrow = await sql.get(`SELECT * FROM abilities WHERE name = "${chosen}" COLLATE NOCASE`)
                                if(!abrow) return errmsg(`An error occurred when accessing the ability. Please try again`)

                                //gets the userability for stats
                                let usrabrow = await sql.get(`SELECT * FROM userabilities WHERE petowner = "${petrow.owner}" AND pet = "${petrow.name}" AND name = "${chosen}" COLLATE NOCASE`)
                                if(!usrabrow) return errmsg(`An error occurred when accessing the user ability. Please try again`)
                                // --- checks if the enemy is a valid target for this ability:
                                let abilitytargets = abrow.useableon.split(' ') //adds all words in the "useable on" category to an array
                                //adds an error message if the ability can't be used on the enemy class
                                if(!abilitytargets.includes(erow.class)) return encmsg.edit(femb.setFooter(`❌ This ability can't be used on ${erow.class}-class creatures.`)).catch(allerrors)
                                
                                let staminareq = 0

                                // --- adds an error message if the pet doesn't have enough stamina to use the ability
                                if(abrow.stamina < 1){
                                    //if the stamina req is smaller than 1, use it as %-based
                                    staminareq = Math.ceil(usrabrow.stamina*petrow.maxstamina)
                                    if(petrow.stamina < staminareq) return encmsg.edit(femb.setFooter(`❌ ${petrow.name} doesn't have enough stamina to use this ability. (${Math.ceil(staminareq)} required)`)).catch(allerrors)
                                }
                                else{
                                    //otherwise subtract the total stamina amount
                                    staminareq = usrabrow.stamina
                                    if(petrow.stamina < staminareq) return encmsg.edit(femb.setFooter(`❌ ${petrow.name} doesn't have enough stamina to use this ability. (${staminareq} required)`)).catch(allerrors)
                                }   
                                
                                //updates the roundtimer so the round doesn't advance on it's own
                                await updateroundtime(20)

                                // --- change damage depending on enemy class
                                let dmgamount = 0
                                switch(erow.class){
                                    case`Small`:    {dmgamount = usrabrow.dmgs; break;}
                                    case`Medium`:   {dmgamount = usrabrow.dmgm; break;}
                                    case`Leviathan`:{dmgamount = usrabrow.dmgl; break;}
                                }
                                // --- changes gained health based on pet class
                                let healthamount = 0
                                switch(petrow.class){
                                    case`Small`:    {healthamount = usrabrow.healths; break;}
                                    case`Medium`:   {healthamount = usrabrow.healthm; break;}
                                    case`Leviathan`:{healthamount = usrabrow.healthl; break;}
                                }
                                // --- adds the health to the pet and information to the recap if any health was restored
                                let healingstring = ``
                                if(healthamount > 0){
                                    //heals the pet
                                    await heal("pet", petrow.health+healthamount)
                                    //updates the turnrecap 
                                    healingstring = `, healed themselves for ${Math.round(petrow.maxhealth*healthamount)} HP`
                                }

                                // --- adds the damage amount to the recap if the ability deals damage
                                function dmgstring(dmg){ //returns either an empty string or 
                                    return dmgamount > 0 ? ` and hit the enemy for ${Math.round(dmg*frow.edmgmult)} ${abrow.dmgtype} damage` : ``
                                }

                                //multiply damage amount with base damage (because ability damage is %-based)
                                // --- changes the turnrecap
                                switch(abrow.dmgtype){
                                    //in case the damage type is raw:
                                    case'none':
                                    case'raw': {
                                        //enemy survived
                                        if(dmgamount<frow.ehealth){
                                            await updaterecaps(`turnrecap`, `${petrow.name} used their ${capfirst(chosen)} ability${healingstring}${dmgstring(Math.round(petrow.attack*dmgamount))}!`)
                                        }
                                        //enemy died
                                        else{await updaterecaps(`turnrecap`, `${petrow.name} used their ${capfirst(chosen)} ability${healingstring} and killed the enemy by dealing ${Math.round(petrow.attack*dmgamount)} raw damage!`)}
                                        
                                        //damages the enemy with the ability  (dasmage is %-based, so multiply with normal damage first, then round to get a clean value)
                                        await damage(`enemy`, Math.round(petrow.attack*dmgamount), abrow.dmgtype)
                                        break;
                                    }
                                    //in case the damage type is melee or ranged:
                                    default: {
                                        //enemy survived
                                        if(Math.round(petrow.attack*dmgamount) < frow.eshields<frow.ehealth){
                                            //enemy shields absorbed all damage:
                                            if(Math.round(petrow.attack*dmgamount) <= frow.eshields){await updaterecaps(`turnrecap`, `${petrow.name} used their ${capfirst(chosen)} ability${healingstring}${dmgstring(Math.round(petrow.attack*dmgamount))}${abrow.dmgtype}${dmgamount>0?`, but the enemies shields absorbed all of it`:``}!`)}
                                            //enemy took some damage:
                                            else{
                                                //adds an additional info to the recap if the enemy has shields
                                                let shieldstring = frow.eshields > 0 && dmgamount > 0 ? `, ${frow.eshields} of which were blocked by it's shields` : ``
                                                await updaterecaps(`turnrecap`, `${petrow.name} used their ${capfirst(chosen)} ability${healingstring}${dmgstring(Math.round(petrow.attack*dmgamount))}${shieldstring}!`)
                                                //damages the enemy with the ability  (dasmage is %-based, so multiply with normal damage first, then round to get a clean value)
                                                await damage(`enemy`, Math.round(petrow.attack*dmgamount), abrow.dmgtype)
                                            }
                                        }
                                        //enemy died
                                        else{
                                            //adds an additional info to the recap if the enemy has shields
                                            let shieldstring = frow.eshields > 0 ? `, ${frow.eshields} of which were blocked by it's shields` : ``
                                            await updaterecaps(`turnrecap`, `${petrow.name} used their ${capfirst(chosen)} ability${healingstring} and killed the enemy by dealing ${Math.round(petrow.attack*dmgamount)} ${abrow.dmgtype} damage${shieldstring}!`)
                                            //damages the enemy with the ability  (dasmage is %-based, so multiply with normal damage first, then round to get a clean value)
                                            await damage(`enemy`, Math.round(petrow.attack*dmgamount), abrow.dmgtype)
                                        }
                                        break;
                                    }

                                }

                                if(abrow.effect.toLowerCase() != "none"){
                                    // --- if the ability has a special effect, apply it and change the turnrecap

                                    //variable for figuring out the correct damage depending on enemy size
                                    let effstrength = erow.class == "small" ? abrow.specialvals : erow.class = "medium" ? abrow.specialvalm : abrow.specialvall

                                    //gets the effect row for damage type
                                    let effrow = await sql.get(`SELECT * FROM effects WHERE name = "${abrow.effect}" COLLATE NOCASE`)
                                    //if the effect isnt found, send an error message
                                    if(!effrow) return errmsg("This effect wasn't found!")

                                    //adds the effect to the enemy
                                    await addeffect(petrow.name, petrow.owner, abrow.effect, effrow.type, abrow.rounds, `enemy`, effstrength, "true")
                                    //adds the effect info to the turnrecap (replaces placeholder text with actual amount of rounds)
                                    await updaterecaps(`turnrecap`, ` ${effrow.applydesc.replace(`ROUNDSAMOUNT`, `${abrow.rounds}`).replace(`TARGET`, `The enemy`)}`)
                                }
                                await drainstamina(petrow.name, petrow.owner, `pet`, staminareq)
                                //enemy round TODO: ADD ENEMY ALIVE CHECK
                                //starts the enemy round
                                await enemyround()
                            }
                        }
                    })
                    fightcollector.on('end', async collected => {
                        //stops the roundtimer function
                        clearInterval(advanceround)
                        //removes any reactions from the fight message
                        encmsg.clearReactions().catch(allerrors)
                        //gets the pet row
                        let petrow = await sql.get(`SELECT * FROM pets WHERE name = "${petname}" AND owner = "${petowner}"`).catch(allerrors)
                        //either goes into taming or ends the fight
                        if(endfight == "taming"){
                            //counts the number of ongoing tames the user has
                            let amount = await sql.get(`SELECT COUNT(species) AS num FROM tames WHERE userId = "${petrow.owner}"`).catch(allerrors)
                            //if the user doesn't have ongoing tames, set the amount to 0
                            if(!amount || amount == undefined){amount = 0}
                            //gets the user row for the newest values
                            let urow = await sql.get(`SELECT * FROM users WHERE userId = "${petrow.owner}"`)
                            //if the user isn't found, set the amount to 100 to ensure they can't tame any more creatures (because this is definetly an error, since they can't fight without any pets so they have to have some and the database request just didnt work for some reason. This ensures they don't get more pets than their level allows)
                            if(!urow){urow = {pets: 100}}
                            //variable stores the amount of pet and ongoing tames the user has, to determine if they can tame any more
                            let totalamount = amount.num+urow.pets
                            
                            //variable to store the embed description in, changes depending on enemy tameableness
                            let tamedesc = `Your pet knocked out the enemy`
                            //variable for storing which reactions the bot needs to add (0 = only leave & kill, any more are numbers)
                            let toaddreactions = 0
                            //array for storing all the required food the user has
                            let availablefood = []
                            //checks if the enemy is tameable
                            switch(erow.tameable){
                                case 0:{ //enemy is not tameable
                                    tamedesc += `, but this creature can't be tamed. You can choose to either kill it or leave.`
                                    break;
                                }
                                case 1:{ //enemy is tameable normally
                                    // --- checks if the user has the required food
                                    //object determining which kind of creature needs what type of food
                                    let foodobj = {
                                        Herbivore : [`Vegetation`],
                                        Omnivore  : [`Vegetation`, `Meat`],
                                        Carnivore : [`Meat`]
                                    }
                                    //gets the inventory of the user
                                    let foodrows = await sql.all(`SELECT * FROM useritems WHERE owner = "${petrow.owner}" AND category = "Food" AND effect = "Taming"`).catch(allerrors)
                                    //adds all food items that match the requirements to the array
                                    for(row in foodrows){
                                        if(foodobj[erow.diet].includes(foodrows[row].type)) availablefood.push(foodrows[row].name)
                                    }
                                    //variable for storing the users options as to what to feed the creature
                                    let options = `You can use one of the following items to tame it, kill it or leave.\n\n`
                                    if(totalamount >= urow.lvl){tamedesc += `, but you can't have any more pets at your current level. You can choose to either kill it or leave.`}
                                    else if(availablefood.length<1){tamedesc += `, but you don't have anything to tame it with. You can choose to either kill it or leave.`}
                                    else if(availablefood.length == 1){
                                        tamedesc += `!\nYou can use your available **${availablefood[0]}** to tame it (\`[1]\`), leave or kill it.`
                                        toaddreactions = 1
                                    }
                                    else{
                                        //adds all options to the variable
                                        for(i=0; i<availablefood.length; i++){
                                            options += `**[${i+1}]** ${availablefood[i]}\n`
                                        }
                                    tamedesc += `! ${options}`
                                    toaddreactions = availablefood.length
                                    }
                                    break;
                                }
                                case 2:{ //enemy taming requires special circumstances W.I.P.
                                    tamedesc += `, but this creature can't be tamed normally. Find another way to tame it. You can choose to either kill it or leave`
                                    break;
                                }
                            }
                            //creates a new embed for taming
                            let tameemb = new Discord.RichEmbed()
                            .setTitle(`Taming`)
                            .setColor(`#6b03fc`)
                            .setDescription(`${tamedesc}`)
                            await encmsg.edit(tameemb)
                            //pauses for 1 second to avoid reaction collisions
                            await sleep(1000)
                            //reacts with the appropiate reactions
                            await encmsg.react(fightmoji).then(() => encmsg.react(escapemoji).then(async() => {
                                if(toaddreactions > 0 && totalamount < urow.lvl){//adds more reactions for the taming food, if the user can tame another creature
                                    //object to get all correct reactions
                                    let reactionobj = {1:"1️⃣",2:"2️⃣",3:"3️⃣",4:"4️⃣",5:"5️⃣",6:"6️⃣",7:"7️⃣",8:"8️⃣",9:"9️⃣"}
                                    for(i=0; i< toaddreactions; i++){
                                        await encmsg.react(reactionobj[i+1])
                                    }
                                }
                            }))

                            //an array of all reactions the bot will look for
                            let possiblereactions = [`fight`, `escape`, `1️⃣`, `2️⃣`, `3️⃣`, `4️⃣`, `5️⃣`, `6️⃣`, `7️⃣`, `8️⃣`, `9️⃣`]
                            
                            //variable for storing if the user reacted
                            let tamereacted = "n"
                            //makes sure only the message author can react
                            const filter = (reaction, user) => !user.bot && user.id == message.author.id;
                            //collects reactions from the message author for the next 30 seconds
                            let tamecollector = encmsg.createReactionCollector(filter, {time: 300000});
                            //checks for reactions during the taming process
                            tamecollector.on('collect', async (reaction, fightcollector) => {
                                //determines which reaction the user chose
                                const chosen = reaction.emoji.name;

                                // --- acts out the users decision
                                if(chosen == "fight"){//user kills the enemy

                                    //ensures the bot knows the user reacted in time
                                    tamereacted = "y"
                                    //stops the reaction collector
                                    tamecollector.stop()
                                    //removes all reactions from the taming embed
                                    encmsg.clearReactions().catch(allerrors)

                                    // --- determines how many and which drops the user gets 
                                    //creates an object defining probability of the drops in %
                                    let dropprobob = {Common: 50, Uncommon: 30, Rare: 20}
                                    //creates an object defining how many drops the user gets (small creatures drop 1, medium drop 2 and leviathans 3)
                                    let dropamounts = {Small: `1`, Medium: `2`, Leviathan: `3`}

                                    // --- empty arrays for drops of each category to push the availablöe drops in later
                                    let drops_common = []
                                    let drops_uncommon = []
                                    let drops_rare = []
                                    //array to store the drops the user gets in later
                                    let drops_chosen = []

                                    //gets all drops of the enemy species
                                    let droprows = await sql.all(`SELECT * FROM drops WHERE creature = "${encounter}"`)
                                    //if no drops are found, send error message
                                    if(droprows == `` ||droprows == undefined) return errmsg(`Sorry, this creature doesn't seem to drop anything!`)
                                    //goes through each row and pushes the names to the correct arrays
                                    for(row in droprows){
                                        switch(droprows[row].quality){
                                            case`Common`: drops_common.push(droprows[row].name); break;
                                            case`Uncommon`: drops_uncommon.push(droprows[row].name); break;
                                            case`Rare`: drops_rare.push(droprows[row].name); break;
                                        }
                                    }
                                    
                                    //adds a random drop from a random array to the drops the users get, the larger the enemy, the more drops they get
                                    for(i=1; i<=dropamounts[erow.class]; i++){
                                        //array to add all qualities with their probablities to, to select a random one later
                                        let qualities = []
                                        //adds the qualities to the array according to their probability
                                        for(i = 0; i<= Object.keys(dropprobob).length; i++){
                                            for(k=1; k <= dropprobob[Object.keys(dropprobob)[i]]; k++){
                                                qualities.push(Object.keys(dropprobob)[i])
                                            }
                                        }
                                        //chooses a random drop depending on the quality
                                        switch(qualities[Math.floor(Math.random() * qualities.length)]){
                                            case`Common`: {//selected drop is common
                                                drops_chosen.push(drops_common[Math.floor(Math.random() * drops_common.length)])
                                                break;
                                            }
                                            case`Uncommon`: {//selected drop is uncommon
                                                //if the enemy has no uncommon drops, drop common
                                                if(drops_uncommon.length > 0){drops_chosen.push(drops_uncommon[Math.floor(Math.random() * drops_uncommon.length)])}
                                                else{drops_chosen.push(drops_common[Math.floor(Math.random() * drops_common.length)])}
                                                break;
                                            }
                                            case`Rare`: {//selected drop is rare
                                                //if the enemy has no rare drop, drop uncommon, if no uncommon, drop common
                                                if(drops_rare.length>1){drops_chosen.push(rare[Math.floor(Math.random() * rare.length)])}
                                                else if(drops_uncommon.length>1){drops_chosen.push(drops_uncommon[Math.floor(Math.random() * drops_uncommon.length)])}
                                                else{drops_chosen.push(drops_common[Math.floor(Math.random() * drops_common.length)])}
                                                break;
                                            }
                                        }
                                    }
                                    //variable for displaying what drops the user got in the embed
                                    let dropstr = ``
                                    for(i=0; i<drops_chosen.length; i++){
                                        //gets the row of the drop in the database (for amounts)
                                        let droprow = await sql.get(`SELECT * FROM drops WHERE creature = "${encounter}" AND name = "${drops_chosen[i]}"`)
                                        if(!droprow) return errmsg(`Sorry, that drop wasn't found.`)
                                        //array to store the minimum and maximum amount in
                                        let minmaxarray = droprow.quantity.split("-")
                                        //chooses how many of the drop the user gets
                                        let amount = randomintminmax(minmaxarray[0], minmaxarray[1])
                                        //ensures the user always gets at least one item
                                        if(amount < 1) {amount = 1}
                                        //adds the amount and item the user got to the sting to display in the embed
                                        dropstr = dropstr + `• **${amount}x ${drops_chosen[i]}** (${droprow.quality})\n`

                                        //adds the item to the users inventory
                                        await newuseritem(amount, drops_chosen[i], petrow.owner)
                                    }

                                    await addxp(medxp, petrow.owner, petrow.name)
                                    
                                    //creates a new embed for taming
                                    let killembed = new Discord.RichEmbed()
                                    .setTitle(`Taming cancelled`)
                                    .setColor(`#6b03fc`)
                                    .setDescription(`You chose to kill the enemy and harvested:\n${dropstr}${xplvlchange}`)
                                    await encmsg.edit(killembed)
                                    encmsg.edit().catch(allerrors)
                                }
                                else if(chosen == "escape"){//user leaves
                                    //ensures the bot knows the user reacted in time
                                    tamereacted = "y"
                                    //stops the reaction collector
                                    tamecollector.stop()
                                    //removs all reactions from the message
                                    encmsg.clearReactions().catch(allerrors)

                                    //adds even more xp to the user
                                    await addxp(Math.round(goodxp+(goodxp/2)), petrow.owner, petrow.name)
                                    //creates a new embed for taming
                                    let leaveembed = new Discord.RichEmbed()
                                    .setTitle(`Taming cancelled`)
                                    .setColor(`#6b03fc`)
                                    .setDescription(`You chose to let it live and got 50% extra XP for your good deeds!${xplvlchange}`)
                                    encmsg.edit(leaveembed).catch(allerrors)
                                }
                                else if(possiblereactions.includes(chosen) && totalamount < urow.lvl){//user reacts with a number and can have another pet
                                    //gets the row of the food item the user chose
                                    let foodrow = await sql.get(`SELECT * FROM useritems WHERE category = "Food" AND owner = "${petrow.owner}" AND name = "${availablefood[possiblereactions.indexOf(chosen)-2]}"`)
                                    //if it doesn't find the item row, send an error message
                                    if(!foodrow) return errmsg(`An error with the food item ocurred. Please try again.`)
                                    // --- gets the number of pets of the same species as the enemy the user currently has
                                    let petamountrows = await sql.all(`SELECT * FROM pets WHERE owner = "${petrow.owner}" AND species = "${encounter}"`)
                                    let petamount = petamountrows.length
                                    let petxp = Math.pow(enemylvl, 2)/0.01

                                    //saves the current time to a variable so we can use it to get the tamerow later 
                                    let time = getcurdate()
                                    // --- adds the enemy to the taming table (or creates the table if it doesn't exist)
                                    await sql.all(`SELECT * FROM tames WHERE species = "${encounter}" AND userId = "${petrow.owner}"`).then((rows) =>{
                                        if(!rows || rows == "" || rows == undefined){ //if there's no creature of the same species the user is currently taming, just insert it normally
                                            sql.run(`INSERT INTO tames (userId, species, name, attack, health, maxhealth, shields, stamina, maxstamina, torp, maxtorp, torptime, food, maxfood, foodtime, consumption, foodtype, ability1, ability2, ability3, xp, lvl, tamereq, tameprog, tametime, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, petrow.owner, encounter, `${encounter}${petamount}`, frow.eattack, frow.ehealth, frow.emaxhealth, frow.eshields, frow.estamina, frow.emaxstamina, frow.emaxtorp, frow.emaxtorp, getcurdate(), erow.maxfood, erow.maxfood, getcurdate(), erow.tamefoodreq, foodrow.name, frow.eability1, frow.eability2, frow.eability3, petxp, enemylvl, erow.tamereq, 0, getcurdate(), time).catch(allerrors)
                                        }
                                        else{ //if the user is already taming a creature of the same type, rename this one with a number (equal to the amount of other creatures of this species the user's currently taming + the amount of creatures of this species the user already owns)
                                            sql.run(`INSERT INTO tames (userId, species, name, attack, health, maxhealth, shields, stamina, maxstamina, torp, maxtorp, torptime, food, maxfood, foodtime, consumption, foodtype, ability1, ability2, ability3, xp, lvl, tamereq, tameprog, tametime, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, petrow.owner, encounter, `${encounter}${rows.length+petamount}`, frow.eattack, frow.ehealth, frow.emaxhealth, frow.eshields, frow.estamina, frow.emaxstamina, frow.emaxtorp, frow.emaxtorp, getcurdate(), erow.maxfood, erow.maxfood, getcurdate(), erow.tamefoodreq, foodrow.name, frow.eability1, frow.eability2, frow.eability3, petxp, enemylvl, erow.tamereq, 0, getcurdate(), time).catch(allerrors)
                                        }
                                    }).catch(() =>{//if the table doesn't exist yet, create it and add a new row for the user's current tame
                                        sql.run("CREATE TABLE IF NOT EXISTS tames (userId TEXT, species TEXT, name TEXT, attack INTEGER, health INTEGER, maxhealth INTEGER, shields INTEGER, stamina INTEGER, maxstamina INTEGER, torp INTEGER, maxtorp INTEGER, torptime INTEGER, food INTEGER, maxfood INTEGER, foodtime INTEGER, consumption INTEGER, foodtype INTEGER, ability1 TEXT, ability2 TEXT, ability3 TEXT, xp INTEGER, lvl INTEGER, tamereq INTEGER, tameprog INTEGER, tametime INTEGER, time INTEGER)").then(()=>{
                                            sql.run(`INSERT INTO tames (userId, species, name, attack, health, maxhealth, shields, stamina, maxstamina, torp, maxtorp, torptime, food, maxfood, foodtime, consumption, foodtype, ability1, ability2, ability3, xp, lvl, tamereq, tameprog, tametime, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, petrow.owner, encounter, `${encounter}${petamount}`, frow.eattack, frow.ehealth, frow.emaxhealth, frow.eshields, frow.estamina, frow.emaxstamina, frow.emaxtorp, frow.emaxtorp, getcurdate(), erow.maxfood, erow.maxfood, getcurdate(), erow.tamefoodreq, frow.eability1, frow.eability2, frow.eability3, petxp, enemylvl, erow.tamereq, 0, getcurdate(), time).catch(allerrors)
                                        })
                                    })

                                    let tamerow = await sql.get(`SELECT * FROM tames WHERE userId = "${petrow.owner}" AND species = "${encounter}" AND time = "${time}"`).catch(allerrors)
                                    if(!tamerow) return errmsg(`Sorry, an error ocurred when accessing your tame. Please try again`)

                                    //ensures the bot knows the user reacted in time
                                    tamereacted = "y"
                                    //stops the reaction collector
                                    tamecollector.stop()
                                    //sets the bot to typing mode, so the user knows the command worked
                                    message.channel.startTyping();

                                    // --- composes the ability image
                                    //adds all images that are required to an array
                                    var images = [ `../Al-An/assets/menus/taming.jpg`, `../Al-An/assets/bars/pets/taming.png`, `../Al-An/assets/bars/pets/torpor.png`, `../Al-An/assets/menus/menuimgs/${erow.diet}.png`]
                                    var jimps = [] //empty array to store the jimps later
                                    for (var i = 0; i < images.length; i++){
                                        jimps.push(jimp.read(images[i])) //pushes the processed images to the empty array
                                    }
                                    await Promise.all(jimps).then(function(data) {
                                        return Promise.all(jimps) //waits for the promise to be resolved
                                    }).then(async function(data){
                                        //variable to store the taming progress in % in
                                        let prog = (Math.floor((tamerow.tameprog/tamerow.tamereq)*1000))/10
                                        //variable to store the percentage of remaining torpidity in
                                        let torpperc = (Math.floor((tamerow.torp/tamerow.maxtorp)*1000))/10
                                        //variable to store the size of the taming bar, minimum 1px, maximum 1178
                                        let sizextaming = Math.round(1178*(prog/100)) > 1178 ? 1178 :  Math.round(1178*(prog/100)) < 1 ? 1 : Math.round(1178*(prog/100))
                                        //variable to store  the size of the torpidiy bar, minimum 1px, maximum 1178
                                        let sizextorp = Math.round(1178*(torpperc/100)) > 1178 ? 1178 :  Math.round(1178*(torpperc/100)) < 1 ? 1 : Math.round(1178*(torpperc/100))

                                        //changes the size of the taming bar to represent the progress
                                        data[1].resize(sizextaming, 98)
                                        //changes the size of the torpidity bar to represent the remaining torpidity
                                        data[2].resize(sizextorp, 98)
                                        //resizes the diet icon (makes the carnivore icon slightly bigger)
                                        if(erow.diet == "Carnivore"){data[3].resize(55, 55)}
                                        else{data[3].resize(50, 50)}
                                    
                                        //this is where we composit the images together
                                        data[0].composite(data[1], 52, 38)  //adds the taming bar
                                        data[0].composite(data[2], 52, 183) //adds the torpidity bar
                                        data[0].composite(data[3], 660,595) //adds the diet icon
                                        // --- add any text that we need
                                        await jimp.loadFont(`../Al-An/assets/fonts/unisans_50.fnt`).then(async font => {
                                            //loads an even larger font variant
                                            var font_l = await jimp.loadFont(`../Al-An/assets/fonts/unisans_65.fnt`)

                                            // --- prints all the values and text on the image
                                            data[0].print(font_l, 640, 45, {text: `Taming﻿progress﻿(${prog}%)`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            data[0].print(font_l, 640, 190, {text: `Torpidity﻿(${torpperc}%)`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            //adds the enemy species and lvl
                                            data[0].print(font, 130, 395, {text: `${tamerow.species}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            data[0].print(font, 530, 392, {text: `${enemylvl}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            //adds the enemy (max)health
                                            data[0].print(font, 130, 495, {text: `${thousandize(tamerow.health)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            data[0].print(font, 440, 495, {text: `${thousandize(tamerow.maxhealth)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            //adds the enemy shields
                                            data[0].print(font, 130, 595, {text: `${thousandize(tamerow.shields)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            //adds the enemy strength and torpidity damage
                                            data[0].print(font, 760, 395, {text: `${tamerow.attack}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            data[0].print(font, 1120,395, {text: `${erow.torpiditydmg}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            //adds the enemy (max)stamina
                                            data[0].print(font, 760, 495, {text: `${thousandize(tamerow.stamina)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            data[0].print(font, 1085,495, {text: `${thousandize(tamerow.maxstamina)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            //adds the food amount & taming food type and amount
                                            data[0].print(font, 760, 595, {text: `${thousandize(tamerow.food)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            data[0].print(font, 1085,595, {text: `${thousandize(tamerow.maxfood)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            data[0].print(font, 760, 700, {text: `${thousandize(tamerow.foodtype)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                            data[0].print(font, 790, 765, {text: `${thousandize(foodrow.amount)}﻿remaining`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                        })
                                        //saves the composited image to a buffer
                                        var image = new Discord.Attachment(await data[0].getBufferAsync(jimp.MIME_PNG))
                                    
                                        //variable geths the user's user object
                                        let tameuser = await bot.fetchUser(petrow.owner)
                                        //edits the message with the image as an attachment
                                        await message.channel.send(`${tameuser.username}'s taming card for **${tamerow.name}** (lvl. ${tamerow.lvl} ${tamerow.species}):\n⁣`, image).catch(allerrors)
                                        //resets the typing status
                                        message.channel.stopTyping();
                                        //deletes the taming message
                                        encmsg.delete().catch(allerrors)
                                    })
                                }
                            })
                            tamecollector.on('end', async collected => {
                                if(tamereacted == "n"){
                                    //removs all reactions from the message
                                    encmsg.clearReactions().catch(allerrors)
                                    //adds a good amount of XP to the user
                                    await addxp(medxp, petrow.owner, petrow.name)
                                    //creates a new embed for taming
                                    let leaveembed = new Discord.RichEmbed()
                                    .setTitle(`Taming failed`)
                                    .setColor(`#6b03fc`)
                                    .setDescription(`You didn't react in time, so the enemy woke up and fled!${xplvlchange}`)
                                    encmsg.edit(leaveembed).catch(allerrors)
                                }
                            })

                            sql.run(`UPDATE pets SET inbattle = "0" WHERE name = "${petrow.name}" AND owner = "${message.author.id}"`).catch(allerrors)
                        }
                        else{
                            //NOT NEEDED RNlet frow = await sql.get(`SELECT * FROM fights WHERE user = "${petrow.owner}" AND pet = "${petrow.name}"`).catch(allerrors)
                            //deletes the fight row and removes the pet's inbattle state so it can be edited again
                            //DISABLED TEMPORARILY sql.run(`DELETE FROM fights WHERE user = "${message.author.id}" AND pet = "${petrow.name}"`).catch(allerrors)
                            sql.run(`UPDATE pets SET inbattle = "0" WHERE name = "${petrow.name}" AND owner = "${message.author.id}"`).catch(allerrors)
                        }
                    })
                }
            })
            encountercollector.on('end', async e => {
                if(reacted == "n"){//if the user didn't react, damage the pet by the enemy dmg
                    //damages the pet
                    await applydamage(petrow.name, petrow.owner, enemy_attack, `after being attacked during an encounter`, enemy_torpdmg)
                    //variable to store the outcome and display it later
                    let txt = `${enemy_attack} raw damage, dealing ${enemy_torpdmg} torpidity damage!`
                    //if the enemy killed the pet, add that to the info
                    if(enemy_attack >= petrow.health){txt = txt.replace(`${enemy_attack} raw damage and killed it!`)}
                    //clears the reactions on the message
                    encmsg.clearReactions().catch(allerrors)
                    //update the embed description & color
                    encemb.setDescription(`You didn't react in time so the enemy attacked your pet and hit it for ${txt}`)
                    encemb.setColor(`FF7777`)
                    encemb.setTitle(`Encounter results:`)
                    encmsg.edit(encemb).catch(allerrors)
                }
            })
        }
        else if(geb > 70){
            // --- good loot         | 30% |
            items = []
            // --- adds all items from the database to an array
            locresrows.forEach((row) =>{
                for(i=1;i<=row.chance; i++){
                    items.push(row.name)
                }
            })
            // --- selects a random item from the array
            let item = items[Math.floor(Math.random()*items.length)]
            // --- checks if the item exists
            let irow = await sql.get(`SELECT * FROM items WHERE name = "${item}"`)
            if(!irow) return errmsg(`An error occurred, please try again`).then(() => console.log(item)).catch(allerrors)
            // --- decreases the amount of items found with their value
            let amount = irow.value <= 15 ? randomInt(5) : irow.value <= 45 ? randomInt(3) : irow.value <= 65 ? randomInt(2) : 1
            // --- adds the item and experience
            newuseritem(amount, item, message.author.id)
            await addxp(goodxp, message.author.id, petrow.name)

            await goodemb.setDescription(`${petrow.name} found ${amount}x **${item}**.${xplvlchange}`)
            message.channel.send(goodemb).catch(allerrors)
        }
    }

    //────────── new command ──────────

    else if(petcmd == "level" || petcmd == "lvl"){
        //if no pet is specified:
        if(!petargs[0]) return message.channel.send(`${botno} Please specify which pet you want to train.`).catch(allerrors)

        //checks if the user owns specified pet
        let petrow = await sql.get(`SELECT * FROM pets WHERE owner = "${message.author.id}" AND name LIKE ?`, `${petargs[0]}%`)
        if(!petrow) return errmsg(`You don't have a pet called/starting with "${petargs[0]}"!`).catch(allerrors)
        else if(petrow.points < 1) return errmsg(`Your pet doesn't have any upgrade points to spend!`).catch(allerrors)
        else if(petrow.ko == 1) return errmsg(`You can't level an unconscious pet!`)
        //gets the creature's row
        let crrow = await sql.get(`SELECT * FROM creatures WHERE species = "${petrow.species}"`)
        if(!crrow) return errmsg(`Sorry, an error occurred.`).catch(allerrors)

        //checks the menu cooldown for this user and stops them from using multiple menus at once:
        if (await checkcooldown(`menu`, message.author.id) > 0) return errmsg(`You already have an open menu, please close it before opening another one.`)
        else {await newcooldown(`menu`, 60, message.author.id)}

        //sets the bots status to typing, so the user knows the command worked
        message.channel.startTyping()
        //adds all images that are required to an array
        var images = [`../Al-An/assets/menus/leveling.jpg`, `../Al-An/assets/menus/menuimgs/${crrow.diet}.png`, `../Al-An/assets/creatures/${petrow.species}/${petrow.skin}.png`, `../Al-An/assets/menus/petprof_overlay_leveling.png`]
        var jimps = [] //empty array to store the jimps later
        for (var i = 0; i < images.length; i++){
            jimps.push(jimp.read(images[i])) //pushes the processed images to the empty array
        }
        await Promise.all(jimps).then(function(data) {
            return Promise.all(jimps) //waits for the promise to be resolved
        }).then(async function(data){
            // --- changes the sizes of some images
            data[1].resize(55,55) //resizes the food icon
            data[2].resize(300, 300) //changes the size of the creature image to fit the frame
            data[2].opacity(0.9) //makes the creature image slightly transparent
            data[3].resize(750, 750) //resizes the water overlay to fit the image
            data[3].opacity(0.5) //makes the water overlay 50% transparent

            //this is where we composit the images together
            data[0].composite(data[1], 42, 855) //adds the diet image
            data[0].composite(data[2], 250, 45) //adds the pet image
            data[0].composite(data[3], -100, -300) //adds the water overlay
            // --- add any text that we need
            await jimp.loadFont(`../Al-An/assets/fonts/wikifont.fnt`).then(async wikifont => {
                
                // --- prints all the values and text on the image
                //health stat:
                data[0].print(wikifont, 145, 474, {text:  `${thousandize(petrow.health)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 400, 474, {text: `+${thousandize(crrow.maxhealthinc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 600, 474, {text: `${thousandize(crrow.maxhealthinc+petrow.health)}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                //shields stat:
                data[0].print(wikifont, 145, 570, {text:  `${thousandize(petrow.shields)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 400, 570, {text: `+${thousandize(crrow.maxshieldsinc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 600, 570, {text: `${thousandize(crrow.maxshieldsinc+petrow.shields)}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                //strength stat: (+ torpidity damage stat)
                data[0].print(wikifont, 145, 668, {text:  `${thousandize(petrow.attack)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 400, 668, {text: `+${thousandize(crrow.maxattackinc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 600, 668, {text: `${thousandize(crrow.maxattackinc+petrow.attack)}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                //stamina stat:
                data[0].print(wikifont, 145, 765, {text:  `${thousandize(petrow.stamina)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 400, 765, {text: `+${thousandize(crrow.maxstaminainc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 600, 765, {text: `${thousandize(crrow.maxstaminainc+petrow.maxstamina)}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                //food stat:
                data[0].print(wikifont, 145, 865, {text:  `${thousandize(petrow.maxfood)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 400, 865, {text: `+${thousandize(crrow.maxfoodinc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 600, 865, {text: `${thousandize(crrow.maxfoodinc+petrow.maxfood)}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                //torpidity stat:
                data[0].print(wikifont, 145, 962, {text:  `${thousandize(petrow.maxtorpidity)}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 400, 962, {text: `+${thousandize(crrow.maxtorpidityinc)}`, alignmentX: jimp.HORIZONTAL_ALIGN_RIGHT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                data[0].print(wikifont, 600, 962, {text: `${thousandize(crrow.maxtorpidityinc+petrow.maxtorpidity)}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
            })
            //saves the composited image to a buffer
            var image = await new Discord.Attachment(await data[0].getBufferAsync(jimp.MIME_PNG))
            //sends the buffer as an attachment to a message
            let lvlmsg = await message.channel.send(`__**${petrow.name}**'s leveling menu__\n\n**To level up your creature, use**\n\`<stat name|number> (<amount of points to spend>)\`\nType \`cancel\` to cancel.`, image)
            //resets the typing status
            message.channel.stopTyping();

            //#region Message collecting
            var reacted = "n" //variable for determining if the user reacted
            const collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 60000 });; //collects msgs from the message author for the next 60 seconds
            collector.on('collect', async (message) => {
                let authormsg = message
                //gets the pet row from the database to make sure its up-to-date
                petrow = await sql.get(`SELECT * FROM pets WHERE owner = "${message.author.id}" AND name LIKE ?`, `${petargs[0]}%`)
                let args2 = message.cleanContent.trim().split(/ +/g); //for getting the arguments in the new message
                //checks if the users answer is valid: 
                if(!args2[0]) return errmsg(`Please specify which category you want to improve.\n(Health, Food, Stamina, Shields, Strength)`).then(async(message) => {await sleep(5000); message.delete().catch(allerrors); authormsg.delete().catch(allerrors)}).catch(allerrors)
                //if the user cancels the menu, exit
                if(args2[0] == "cancel"){
                    reacted = "exit"
                    return collector.stop()
                }

                let amount = 1 //sets the basic amount of points spent to 1
                if(!args2[1] || isNaN(parseInt(args2[1]))){/*amount stays 1 if no number is specified*/}
                else if (petrow.points < args2[1]){amount = petrow.points} //amount gets set to the max if more than the available points is specified
                else{amount = parseInt(args2[1])} //amount gets set to what the user specified

                //checks if the specified stat exists
                let stats = ["health", "shields", "strength", "stamina", "food", "torpidity"] //things the user can choose
                let dbstats = ["maxhealth", "shields", "attack", "maxstamina", "maxfood", "maxtorpidity"] //the stats in the databank
                let incstats = ["maxhealthinc", "maxshieldsinc", "maxattackinc", "maxstaminainc", "maxfoodinc", "maxtorpidityinc"] //the amount the stats will increase as labeled in the databank
                let fullstats = ["maximum health", "shields", "strength", "maximum stamina", "maximum food", "maximum torpidity"] //the stats in fully written form for the confirmation message
                let chosenstat = ``
                if(!stats.includes(args2[0].toLowerCase())){
                    // --- if the user didnt use the name it checks for the ID
                    //if it's not a valid ID, return an error message (UNLESS user exited)
                    if(args2[0] != "cancel" && (parseInt(args2[0]) < 0 || parseInt(args2[0]) > 6 || isNaN(parseInt(args2[0])))) return errmsg(`There's no category with the ID or called "${args2[0]}"`).then(async(message) => {await sleep(5000); message.delete().catch(allerrors); authormsg.delete().catch(allerrors)}).catch(allerrors)
                    //otherwise, use the ID instead
                    else{chosenstat = dbstats[parseInt(args2[0]-1)]}
                }
                else{
                    chosenstat = dbstats[stats.indexOf(args2[0].toLowerCase())] //sets the variable to the correct stat
                }

                reacted = "y"
                //if the pet doesn't have shields but the user tries to level them up anyways, send an error message
                if(chosenstat == "shields" && petrow.maxshieldsinc == 0) return errmsg(`Your pet can't improve it's shields!`).then(async(message) => {await sleep(5000); message.delete().catch(allerrors); authormsg.delete().catch(allerrors)}).catch(allerrors)

                //updates the pets stats
                await sql.run(`UPDATE PETS SET points = "${petrow.points-amount}", ${chosenstat} = "${petrow[chosenstat]+amount*crrow[incstats[dbstats.indexOf(chosenstat)]]}" WHERE name = "${petrow.name}" AND owner = "${message.author.id}"`).catch(allerrors)

                //sends a confirmation message and deletes itself and the author msg after 5 seconds
                message.channel.send(botye+` You spent ${amount} points to increase your pet's ${fullstats[dbstats.indexOf(chosenstat)]} by ${amount*crrow[incstats[dbstats.indexOf(chosenstat)]]}`).then(async(msg) => {
                    authormsg.delete().catch(allerrors)
                }).catch(allerrors)
            })

            collector.on('end', async collected => {
                if(reacted=="n"){
                //if the user didn't react, close the menu and inform the user:
                    let endemb = new Discord.RichEmbed()
                    .setDescription(botex+` ${message.author.username}'s leveling menu timed out`)
                    .setColor(`#FFF777`)
                    message.channel.send(endemb).catch(allerrors)
                }
                else if(reacted == "exit"){
                    let endemb = new Discord.RichEmbed()
                    .setDescription(botye+` Exited leveling menu`)
                    .setColor(`#7aff69`)
                    message.channel.send(endemb).catch(allerrors)
                }
                //deletes the image
                lvlmsg.delete().catch(allerrors)
                removecooldown(`menu`, message.author.id)
            });
            //#endregion
        })
    }

    //────────── new command ──────────

    else if(petcmd== "train"){
        //checks the menu cooldown for this user and stops them from using multiple menus at once:
        if (await checkcooldown(`menu`, message.author.id) > 0) return errmsg(`You already have an open menu, please close it before opening another one.`)
        else {await newcooldown(`menu`, 90, message.author.id)}
        //checks if the user specified a pet
        if(!petargs[0]) return errmsg(`Please specify which pet you want to train`).catch(allerrors)
        //the pet row:
        let petrow = await sql.get(`SELECT * FROM pets WHERE owner = "${message.author.id}" AND name = ? COLLATE NOCASE`, petargs[0].toLowerCase())
        if(!petrow) return errmsg(`You don't have a pet called ${petargs[0]}!`).catch(allerrors)
        else if(petrow.ko == 1) return errmsg(`You can't train an unconscious pet!`)

        //gets the creature row from the same species of the pet
        let crrow = await sql.get(`SELECT * FROM creatures WHERE species = "${petrow.species}"`)
        if(!crrow) return errmsg(`An error occurred, please try again!`).catch(allerrors)

        //gets all abilities for a specific class and saves them in an array and a variable
        let abilities = []
        let abilitylist = ``
        let abilityrows = await sql.all(`SELECT * FROM abilities WHERE class = "${petrow.class}"`)
        if(abilityrows == "") return errmsg(`An error occurred while loading abilities. Please try again!`).catch(allerrors)
        abilityrows.forEach((row) => {
            abilitylist = abilitylist + `\n• ${row.name}` //adds all ability names to a variable for the "available abilities" part of the error message
            abilities.push(row.name.toLowerCase()) //adds the ability name to an array
        })

        let petabilities = []
        let petabilityrows = await sql.all(`SELECT * FROM userabilities WHERE pet = "${petrow.name}" AND petowner = "${petrow.owner}"`).catch(allerrors)
        if(petabilityrows == "" || petabilityrows == undefined){/*pet doesn't have any abilities*/}
        else{petabilityrows.forEach((row) => {petabilities.push(row.name.toLowerCase())})} //adds all abilities the pet has to an array

        sql.run(`UPDATE users SET mcooldown = "${getcurdate()+90}" WHERE userId = "${message.author.id}"`)
        choosemsg = await message.channel.send(`\`\`\`py
What do you want to do?\n
[1] Learn a new ability
[2] Train an existing ability to gain points
[3] Level up an existing ability by spending points
[4] View an existing abilities stats
[5] Unlearn an ability\n
Type the respective number beside the action you would like to select.\nType 'cancel' to cancel the training.
        \`\`\``).catch(allerrors)

        //message collecting
        var reacted = "n" //variable for determining if the user reacted
        const collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 30000 });; //collects msgs from the message author for the next 30 seconds
        collector.on('collect', async (message) => {//run this after a message from the user is detected
            let args2 = message.cleanContent.slice().trim().split(/ +/g); //new arguments from the second message
            if(args2[0].toLowerCase() == `cancel`) {reacted = "y"; collector.stop()}
            else if(args2[0] == "1"){//user chose to learn a new ability
                
                if(petabilities.length > 2) return errmsg(`Your pet can't have any more abilities!`).catch(allerrors) //if the pet already has 3 abilities
                else{//pet can acquire one or more extra abilities

                    i = 1
                    availableabilities = ``
                    let availableabilitiesnum = 0
                    let availableabilitynames = []
                    abilityrows.forEach((row) => {
                        if(!petabilities.includes(row.name.toLowerCase())){//if the pet doesn't already own the ability
                            let useablebyarray = row.useableby.split(',') //pushes all classes the ability can be used by to an array
                            if(!useablebyarray.includes(crrow.diet)) return i = i+1//ignores all abilities the pet cant use because of it's diet

                            //the ability gets added to a variable for display in the menu
                            availableabilities = availableabilities + `[${i}] ${row.name} (Level requirement: ${row.lvl})\n`
                            //adds one to the amount of abilities the player could obtain
                            availableabilitiesnum = availableabilitiesnum + 1
                            //adds the ability name to an array
                            availableabilitynames.push(row.name.toLowerCase())
                            i = i+1
                        }
                    })
                    let syntax = `py`
                    if(availableabilitynames.length<1){availableabilities = `== No new abilities currently available ==\n: Level up your pet to unlock new ones! :\n`; syntax = `asciidoc`} //if no abilities are available it sets the variable to say that and changes the syntax highlighting
                    //deletes the users message, then ends the first collector
                    message.delete().catch(allerrors)
                    reacted = "y"; collector.stop()

                    //new collector:
                    reacted = "n"
                    choose2msg = await message.channel.send(`\`\`\`${syntax}\nWhich ability do you want to train?\n\n${availableabilities}\nType the respective number beside the ability you want to train.${availableabilitynames.length>=1?`\nType 'cancel' to cancel the training.`:` Training has been cancelled.`}\`\`\``).catch(allerrors)
                    
                    if(availableabilitynames.length<1) return collector.stop();//exits if no abilities are available and stops the collector 

                    const collector2 = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 30000 });; //collects msgs from the message author for the next 30 seconds
                    collector2.on('collect', async (message) => {//run this after a second message from the user is detected

                        let args3 = message.cleanContent.slice().trim().split(/ +/g); //new arguments from the third message
                        if(args3[0].toLowerCase() == "cancel"){reacted = "y"; collector2.stop()}
                        else{
                            if(isNaN(parseInt(args3[0]))) return //ignores any non number messages from the author
                            else if(parseInt(args3[0]) > availableabilitynames.length) return //ignores numbers that are too large
                            else{
                                let name = availableabilitynames[parseInt(args3[0]-1)] //gets the ability name from an array defined earlier via the number the user inputs
                                let abilityrow = await sql.get(`SELECT * FROM abilities WHERE LOWER(name) = ?`, name) //gets the ability row with the respective name
                                if(!abilityrow) return errmsg(`An error occured while accessing the ability. Please try again later`).then(() => collector2.stop()).catch(allerrors)
                                else if(abilityrow.lvl > petrow.lvl){
                                    //if the pet's level is too low to learn the ability, send an error message and delete it after 3 seconds
                                    errmsg = await errmsg(`Your pet needs to level up ${abilityrow.lvl-petrow.lvl} more times to learn this ability!`)
                                    await sleep(3000) //waits 3 seconds
                                    errmsg.delete().catch(allerrors) //deletes the error message
                                }
                                else{
                                    //if the pet can learn the ability:

                                    sql.get(`SELECT * FROM userabilities WHERE name = "${abilityrow.name}" petowner = "${message.author.id}" AND pet = "${petrow.name}" COLLATE NOCASE`).then((row) =>{
                                        if(!row){
                                            sql.run(`INSERT INTO userabilities (name, pet, petowner, dmgs, dmgm, dmgl, healths, healthm, healthl, stamina, effect, special, specialvals, specialvalm, specialvall, rounds, pic, emojiid, points, xp, lvl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, abilityrow.name, petrow.name, message.author.id, abilityrow.dmgs, abilityrow.dmgm, abilityrow.dmgl, abilityrow.healths, abilityrow.healthm, abilityrow.healthl, abilityrow.stamina, abilityrow.effect, abilityrow.special, abilityrow.specialvals, abilityrow.specialvalm, abilityrow.specialvall, abilityrow.rounds, abilityrow.pic, abilityrow.emojiid, 0, 0, 0).catch(allerrors)
                                        }
                                    }).catch(() =>{
                                        sql.run(`CREATE TABLE IF NOT EXISTS userabilities (name TEXT, pet TEXT, petowner INTEGER, dmgs INTEGER, dmgm INTEGER, dmgl INTEGER, healths INTEGER, healthm INTEGER, healthl INTEGER, stamina INTEGER, effect TEXT, special TEXT, specialvals INTEGER, specialvalm INTEGER, specialvall INTEGER, rounds INTEGER, pic TEXT, emojiid INTEGER, points INTEGER, xp INTEGER, lvl INTEGER)`).then(() => {
                                            sql.run(`INSERT INTO userabilities (name, pet, petowner, dmgs, dmgm, dmgl, healths, healthm, healthl, stamina, effect, special, specialvals, specialvalm, specialvall, rounds, pic, emojiid, points, xp, lvl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, abilityrow.name, petrow.name, message.author.id, abilityrow.dmgs, abilityrow.dmgm, abilityrow.dmgl, abilityrow.healths, abilityrow.healthm, abilityrow.healthl, abilityrow.stamina, abilityrow.effect, abilityrow.special, abilityrow.specialvals, abilityrow.specialvalm, abilityrow.specialvall, abilityrow.rounds, abilityrow.pic, abilityrow.emojiid, 0, 0, 0).catch(allerrors)
                                        })
                                    })

                                    let effstrength = abilityrow.effect != "None" ? `(Strength: ${abilityrow.specialvals*100}% | ${abilityrow.specialvalm*100}% | ${abilityrow.specialvall*100}%)` : `` //only adds the strength part to the effect, if the ability has one
                                    message.channel.send(`<:${abilityrow.name.toLowerCase()}:${abilityrow.emojiid}> **${abilityrow.name}**\n${petrow.name} acquired a new ability!\`\`\`js\n== Ability stats: ==\n\nType          : ${abilityrow.type}${abilityrow.dmgtype != "" ? abilityrow.dmgtype : ``}\nStamina req.  : ${abilityrow.stamina*100}%\nDamage        : ${abilityrow.dmgs*100}% | ${abilityrow.dmgm*100}% | ${abilityrow.dmgl*100}%\nHealth change : ${abilityrow.healths*100}% | ${abilityrow.healthm*100}% | ${abilityrow.healthl*100}%\nEffect        : ${abilityrow.effect} ${effstrength}\nRounds        : ${abilityrow.rounds}\nDescription   : ${abilityrow.desc}\n\n(${abilityrow.dmgs*100}% damage = ${abilityrow.dmgs*100}% of normal attack damage)\n\nStats are always ordered like this:\n<value vs. small opponents> | <vs. medium> | <vs. leviathans>\`\`\``).catch(allerrors)
                                    reacted = "y"
                                    collector2.stop();
                                }
                            }
                        }
                    })
                    collector2.on('end', async collected => {
                        choose2msg.delete().catch(allerrors)
                        if(reacted == "n"){message.channel.send(`<@${message.author.id}>, your menu timed out!`).catch(allerrors)} //sends a notification if thee user didnt react
                        sql.run(`DELETE FROM usercooldowns WHERE user = "${message.author.id}" AND name = "menu"`) //deletes the menu cooldown
                        //deletes the user message
                        message.delete().catch(allerrors)
                        //deletes the menu cooldown
                        removecooldown(`menu`, message.author.id)
                    })
                }
            }
            else if(args2[0] == "2"){//user chose to train an existing ability
                if(petabilities.length < 1){
                    //if the pet doesn't have any abilities, delete the user message, send an error message and delete that after 5 seconds
                    message.delete().catch(allerrors)
                    noabilitiesmsg = await errmsg(`Your pet doesn't have any abilities!`)
                    await sleep(5000).then(() => noabilitiesmsg.delete()).catch(allerrors)
                }
                else{
                    //deletes the users message, then the first collector
                    message.delete().catch(allerrors)
                    reacted = "y"; collector.stop()

                    i = 1
                    availableabilities = ``
                    for(ability of petabilities){ //using for of loop to make sure it runs before the next part so the variables update
                        let row = await sql.get(`SELECT * FROM userabilities WHERE LOWER(name) = "${ability}" AND petowner = "${message.author.id}" AND pet = "${petrow.name}" COLLATE NOCASE`)
                        if(!row) return
                        //the ability gets added to a variable for display in the menu
                        availableabilities = availableabilities + `[${i}] ${row.name} (XP: ${row.xp}, Points: ${row.points}, Level: ${row.lvl})\n`
                        i++
                    }
                    let syntax = `py`   
                    if(i < 2) {availableabilities = `: Your pet doesn't have any abilities at this time! :\n`; syntax = `asciidoc`} //if the pet doesn't have any abilities, change the message and it's colors
                    
                    //new collector:
                    reacted = "n"
                    choose2msg = await message.channel.send(`\`\`\`${syntax}\nWhich ability do you want to train?\n\n${availableabilities}\nType the respective number beside the ability you want to train.\nType 'cancel' to cancel the training.\`\`\``).catch(allerrors)
                    const collector2 = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 30000 });; //collects msgs from the message author for the next 30 seconds
                    collector2.on('collect', async (message) => {//run this after a second message from the user is detected

                        let args3 = message.cleanContent.slice().trim().split(/ +/g); //new arguments from the third message
                        if(args3[0].toLowerCase() == 'cancel') {reacted = "y"; collector2.stop()} //exits the collector if the user cancels
                        else if(isNaN(parseInt((args3[0])) || parseInt(args3[0]) > petabilities.length)) return //ignores all messages that aren't numbers or numbers higher than the ones displayed in the message
                        else{
                            let name = petabilities[parseInt(args3[0]-1)] //gets the ability name from an array defined earlier via the number the user inputs
                            let abilityrow = await sql.get(`SELECT * FROM userabilities WHERE LOWER(name) = ? AND pet = "${petrow.name}" AND petowner = "${message.author.id}"`, name) //gets the ability row with the respective name
                            if(!abilityrow) return errmsg(`An error occured while accessing the ability. Please try again later`).then(() => collector2.stop()).catch(allerrors)

                            //three different xp "tiers" the pet can get:
                            let badxp =  1   + randomInt(4) + petrow.lvl * (randomInt(2)-1) //increases xp slightly based on pet lvl
                            let medxp =  5   + randomInt(6) + petrow.lvl * (randomInt(3)-1) //increases xp based on pet lvl

                            let succhance = randomInt(100)
                            if(succhance <= 15){
                                // --- training failed

                                //adds xp to the pet
                                await addxp(badxp, message.author.id, petrow.name)
                                message.delete().catch(allerrors)//deletes the user's message
                                message.channel.send(`\`\`\`diff\n- Training failed! -\n\n${petrow.name} got bored and didn't do what you want.\nPet experience: ${xplvlchange}\`\`\``).catch(allerrors) //sends a result message
                                //stops the collector
                                reacted = "y"; collector2.stop()
                            }
                            else if (succhance < 85){
                                // --- training successful

                                //adds xp to the pet
                                await addxp(medxp, message.author.id, petrow.name)

                                //calculates the amount of ability xp
                                let xp = 8 + (randomInt(11)-1) //adding -1 so 0 is also possible
                                let lvlup = ``
                                if(abilityrow.xp + xp > 100){//if the ability has 100 xp, adda lvlup message, resets the xp and adds a point
                                    lvlup = ` and one point! Total points: ${abilityrow.points+1}`
                                    sql.run(`UPDATE userabilities SET xp = "${abilityrow.xp+xp-100}", points = "${abilityrow.points+1}" WHERE name = "${abilityrow.name}" AND pet = "${petrow.name}" AND petowner = "${message.author.id}"`)
                                }
                                else{sql.run(`UPDATE userabilities SET xp = "${abilityrow.xp + xp}" WHERE name = "${abilityrow.name}" AND pet = "${petrow.name}" AND petowner = "${message.author.id}"`)}
                                
                                message.delete().catch(allerrors)//deletes the user's message
                                message.channel.send(`\`\`\`diff\n+ Training successful! +${lvlup == ``?``:` Ability leveled up!`}\n\n${petrow.name}'s ${abilityrow.name} ability gained ${xp} xp${lvlup}.\nPet experience: ${xplvlchange}\`\`\``).catch(allerrors) //sends a result message
                                //stops the collector
                                reacted = "y"; collector2.stop()
                            }
                            else{
                                //training super effective

                                //adds xp to the pet
                                await addxp(badxp, message.author.id, petrow.name)

                                //calculates ability xp
                                let xp = 20 + (randomInt(21)-1) //adding -1 so 0 is also possible
                                let lvlup = ``
                                if(abilityrow.xp + xp > 100){//if the ability has 100 xp, adda lvlup message, resets the xp and adds a point
                                    lvlup = `, +1 point! Total points: ${abilityrow.points+1}`
                                    sql.run(`UPDATE userabilities SET xp = "${abilityrow.xp+xp-100}", points = "${abilityrow.points+1}" WHERE name = "${abilityrow.name}" AND pet = "${petrow.name}" AND petowner = "${message.author.id}"`)
                                }
                                else{sql.run(`UPDATE userabilities SET xp = "${abilityrow.xp + xp}" WHERE name = "${abilityrow.name}" AND pet = "${petrow.name}" AND petowner = "${message.author.id}"`)}
                                
                                message.delete().catch(allerrors)//deletes the user's message
                                message.channel.send(`\`\`\`ini\n[Training was super effective!]${lvlup == ``?``:` Ability leveled up!`}\n\n${petrow.name} had a great time and massively improved their ${abilityrow.name} ability! (+${xp} ability xp${lvlup})\nPet experience: ${xplvlchange}\`\`\``).catch(allerrors) //sends a result message
                                //stops the collector
                                reacted = "y"; collector2.stop()
                            }
                        }
                    })
                    collector2.on('end', async collected => {
                        choose2msg.delete().catch(allerrors)
                        if(reacted == "n"){message.channel.send(`<@${message.author.id}>, your menu timed out!`).catch(allerrors)} //sends a notification if thee user didnt react
                        if(reacted == "c") return sql.run(`DELETE FROM usercooldowns WHERE user = "${message.author.id}" AND name = "menu"`) //deletes the menu cooldown if canceled
                        //deletes the user message and ends the previous collector
                        message.delete().catch(allerrors)
                        collector.stop()
                        //deletes the menu cooldown
                        sql.run(`DELETE FROM usercooldowns WHERE user = "${message.author.id}" AND name = "menu"`).catch(allerrors)
                    })
                }
            }
            else if(args2[0] == "3"){//user chose to improve an existing ability
                if(petabilities.length < 1){
                    //if the pet doesn't have any abilities, delete the user message, send an error message and delete that after 5 seconds
                    reacted = "y"
                    message.delete().catch(allerrors)
                    noabilitiesmsg = await errmsg(`Your pet doesn't have any abilities!`)
                    await sleep(5000).then(() => noabilitiesmsg.delete()).catch(allerrors)
                }
                else{
                    //deletes the users message, then the first collector
                    message.delete().catch(allerrors)
                    reacted = "y"; collector.stop()

                    i = 1
                    availableabilities = ``
                    for(ability of petabilities){ //using for of loop to make sure it runs before the next part so the variables update
                        let row = await sql.get(`SELECT * FROM userabilities WHERE LOWER(name) = "${ability}" AND petowner = "${message.author.id}" AND pet = "${petrow.name}" COLLATE NOCASE`)
                        if(!row) return
                        console.log(row)
                        //the ability gets added to a variable for display in the menu
                        availableabilities = availableabilities + `[${i}] ${row.name} (Level: ${row.lvl}/10 | available points: ${row.points})\n`
                        i++
                    }
                    let syntax = `py`   
                    if(i < 2) {availableabilities = `: Your pet doesn't have any abilities at this time! :\n`; syntax = `asciidoc`} //if the pet doesn't have any abilities, change the message and it's colors
                    
                    //new collector:
                    reacted = "n"
                    choose2msg = await message.channel.send(`\`\`\`${syntax}\nWhich ability do you want to train?\n\n${availableabilities}\nType the respective number beside the ability you want to train.\nType 'cancel' to cancel the training.\`\`\``).catch(allerrors)
                    const collector2 = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 30000 });; //collects msgs from the message author for the next 30 seconds
                    collector2.on('collect', async (message) => {//run this after a second message from the user is detected

                        let args3 = message.cleanContent.slice().trim().split(/ +/g); //new arguments from the third message
                        if(args3[0].toLowerCase() == 'cancel') {reacted = "y"; collector2.stop()} //exits the collector if the user cancels
                        else if(isNaN(parseInt(args3[0])) || parseInt(args3[0]) > petabilities.length) return //ignores all messages that aren't numbers or numbers higher than the ones displayed in the message
                        else{
                            let name = petabilities[parseInt(args3[0]-1)] //gets the ability name from an array defined earlier via the number the user inputs
                            let abilityrow = await sql.get(`SELECT * FROM abilities WHERE LOWER(name) = ?`, name) //gets the ability row with the respective name
                            if(!abilityrow) return errmsg(`An error occured while accessing the ability. Please try again later`).then(() => collector2.stop()).catch(allerrors)
                            let usrabilityrow = await sql.get(`SELECT * FROM userabilities WHERE pet = "${petrow.name}" AND petowner = "${petrow.owner}" AND LOWER(name) = ?`, name) //gets the USER ability row with the respective name
                            if(!usrabilityrow) return errmsg(`An error occured while accessing the user-ability. Please try again later`).then(() => collector2.stop()).catch(allerrors)
                            console.log(usrabilityrow)
                            //if the ability doesn't have any avilable points, delete the user message, send and error message and remove it after 5 seconds
                            if(usrabilityrow.points < 1){
                                message.delete().catch(allerrors)
                                let errormsg = await errmsg(`You need more points to upgrade this ability!`).catch(allerrors)
                                await sleep(5000)
                                errormsg.delete().catch(allerrors)
                            }
                            else{
                                reacted = "y"
                                collector2.stop();
                                
                                //variable storing the numbers the user can react with
                                i = 1
                                //variable for informing the user if the stamina stat can't be improved anymore
                                let txt = ``
                                //variable for storing the upgradeable stats in
                                let stats = ``
                                //array for storing the stats in
                                let statsarray = []
                                // --- checks if a stat can be improved and adds it to the variable if it can   
                                if(abilityrow.dmgsinc != 0 || abilityrow.dmgminc != 0 || abilityrow.dmglinc != 0){stats = stats + `[${i}] Ability Damage: + ${abilityrow.dmgsinc}|${abilityrow.dmgminc}|${abilityrow.dmglinc}\n`; statsarray.push(`dmg`); i++} //checks the damage stat
                                if(abilityrow.healthsinc != 0 || abilityrow.healthminc != 0 || abilityrow.healthlinc != 0){stats = stats + `[${i}] Health change: ${abilityrow.healthsinc > 0 ? `+` : `-`} ${abilityrow.healthsinc}|${abilityrow.healthminc}|${abilityrow.healthlinc}\n`; statsarray.push(`health`); i++} //checks the health stat
                                if(abilityrow.specialvalsinc != 0 || abilityrow.specialvalminc != 0 || abilityrow.specialvallinc != 0){stats = stats + `[${i}] Effect damage: + ${abilityrow.specialvalsinc*100}%|${abilityrow.specialvalminc*100}%|${abilityrow.specialvallinc*100}%\n`; statsarray.push(`specialdmg`); i++} //checks the effect stat
                                if(abilityrow.staminainc != 0 && Math.abs(abilityrow.staminainc)<1 && (usrabilityrow.stamina-Math.abs(abilityrow.staminainc)) >= abilityrow.stamina){stats = stats + `[${i}] Stamina cost: - ${Math.abs(abilityrow.staminainc)*100}%\n`; statsarray.push(`stamina`); i++} //checks the stamina stat for percent-based stamina abilities
                                else if(abilityrow.staminainc != 0 && (usrabilityrow.stamina-Math.abs(abilityrow.staminainc)) >= 1){stats = stats + `[${i}] Stamina cost: - ${Math.abs(abilityrow.staminainc)}%\n`; statsarray.push(`stamina`); i++} //checks the stamina stat for total-based stamina abilities
                                else{txt = `   The stamina stat can't be decreased any lower.`}
                                if(abilityrow.roundsincreq != 0){stats = stats + `[${i}] Effect time: + 1 round\n`; statsarray.push(`rounds`); i++} //checks the rounds stat

                                // --- third collector:
                                reacted = "n"
                                choose3msg = await message.channel.send(`\`\`\`${syntax}\nWhich stat do you want to improve?\n\n${stats}\n\nAny stat leveled up (except stamina) will increase the stamina requirement by ${abilityrow.stamina < 1 ? `${Math.abs(abilityrow.staminainc)*100}% of the maximum stamina.` : Math.abs(abilityrow.staminainc)}\nAll stats are ordered like the following:\n<stat vs. small enemies> | <vs. medium> | <vs. leviathan>\n\nType the respective number beside the stat you want to improve.\nType 'cancel' to cancel the training.\`\`\``).catch(allerrors)
                                const collector3 = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 30000 });; //collects msgs from the message author for the next 60 seconds
                                collector3.on('collect', async (message) => {//run this after a second message from the user is detected
    
                                    let args4 = message.cleanContent.slice().trim().split(/ +/g); //new arguments from the fourth message
                                    if(args4[0].toLowerCase() == 'cancel') {reacted = "c"; collector3.stop()} //exits the collector if the user cancels
                                    else if(isNaN(args4[0]) || parseInt(args4[0]) > i) return //ignores all messages that aren't numbers or numbers higher than the ones displayed in the message
                                    else{
                                        let name = statsarray[parseInt(args4[0]-1)] //gets the stat name from an array defined earlier via the number the user inputs
                                        console.log(name)
                                        if(name == "rounds" && usrabilityrow.poins < abilityrow.roundsincreq) {
                                            //if the ability doesn't have enough avilable points to level up rounds, delete the user message, send and error message and remove it after 5 seconds (required points is always 1, only round stat varies)
                                            message.delete().catch(allerrors)
                                            let errmsg = await errmsg(`You need ${abilityrow.roundsincreq} points to improve this stat!`).catch(allerrors)
                                            await sleep(5000)
                                            errmsg.delete().catch(allerrors)
                                        }
                                        else {
                                            // --- updates the chosen stat:
                                            let abilityid = `name = "${usrabilityrow.name}" AND pet = "${petrow.name}" AND petowner = "${petrow.owner}"` //variable for shortening sql.run statements
                                            //checks which stat the user chose, then edits the stat and removes one point and 100 xp
                                            switch(name){
                                                case'dmg':{ //if the chosen stat is damage, improve stat and reset ability leveling (max 2 decimals after comma)
                                                    sql.run(`UPDATE userabilities SET dmgs = "${(usrabilityrow.dmgs + abilityrow.dmgsinc).toFixed(2)}", dmgm = "${(usrabilityrow.dmgm + abilityrow.dmgminc).toFixed(2)}", dmgl = "${(usrabilityrow.dmgl + abilityrow.dmglinc).toFixed(2)}", stamina = "${usrabilityrow.stamina + Math.abs(abilityrow.staminainc)}", points = "${usrabilityrow.points - 1}", xp = "0", lvl = "${usrabilityrow.lvl+1}" WHERE ${abilityid}`)
                                                    break;
                                                }
                                                case'health':{ //if the chosen stat is health, improve stat and reset ability leveling (max 2 decimals after comma)
                                                    sql.run(`UPDATE userabilities SET healths = "${usrabilityrow.healths + abilityrow.healthsinc}", healthm = "${usrabilityrow.healthm + abilityrow.healthminc}", healthl = "${(usrabilityrow.healthl + abilityrow.healthlinc).toFixed(2)}", stamina = "${usrabilityrow.stamina + Math.abs(abilityrow.staminainc)}", points = "${usrabilityrow.points - 1}", xp = "0", lvl = "${usrabilityrow.lvl+1}" WHERE ${abilityid}`)
                                                    break;
                                                }
                                                case'specialdmg':{ //if the chosen stat is special damage, improve stat and reset ability leveling (max 2 decimals after comma)
                                                    sql.run(`UPDATE userabilities SET specialvals = "${(usrabilityrow.specialvals + abilityrow.specialvalsinc).toFixed(2)}", specialvalm = "${(usrabilityrow.specialvalm + abilityrow.specialvalminc).toFixed(2)}", specialvall = "${(usrabilityrow.specialvall + abilityrow.specialvallinc).toFixed(2)}", stamina = "${usrabilityrow.stamina + Math.abs(abilityrow.staminainc)}", points = "${usrabilityrow.points - 1}", xp = "0", lvl = "${usrabilityrow.lvl+1}" WHERE ${abilityid}`)
                                                    break;
                                                }
                                                case'stamina':{ //if the chosen stat is stamina, improve stat and reset ability leveling
                                                    //if the stamina stat is percent-based, change it accordingly (max 2 decimals after comma)
                                                    if(Math.abs(abilityrow.staminainc) < 1) {sql.run(`UPDATE userabilities SET stamina = "${(usrabilityrow.stamina - Math.abs(abilityrow.staminainc)).toFixed(2)}", points = "${usrabilityrow.points - 1}", xp = "0", lvl = "${usrabilityrow.lvl+1}" WHERE ${abilityid}`)}
                                                    else {sql.run(`UPDATE userabilities SET stamina = "${usrabilityrow.stamina - abilityrow.staminainc}", points = "${usrabilityrow.points - 1}", xp = "0", lvl = "${usrabilityrow.lvl+1}" WHERE ${abilityid}`)}
                                                    break;
                                                }
                                                case'rounds':{ //if the chosen stat is rounds, add 1 and reset ability leveling
                                                    sql.run(`UPDATE userabilities SET rounds = "${usrabilityrow.rounds + 1}", stamina = "${usrabilityrow.stamina + Math.abs(abilityrow.staminainc)}", points = "${usrabilityrow.points - 1}", xp = "0", lvl = "${usrabilityrow.lvl+1}", lvl = "${usrabilityrow.lvl+1}" WHERE ${abilityid}`)
                                                    break;
                                                }
                                            }
                                        }
                                        //updates the abilities, then deletes the users message and stops the collector, sending a confirmation message
                                        reacted = "y"
                                        message.delete().catch(allerrors)
                                        collector3.stop();
                                    }
                                })
                                collector3.on('end', async collected => {
                                    choose3msg.delete().catch(allerrors)
                                    if(reacted == "n"){message.channel.send(`<@${message.author.id}>, your menu timed out!`).catch(allerrors)} //sends a notification if thee user didnt react
                                    if(reacted == "c") return sql.run(`DELETE FROM usercooldowns WHERE user = "${message.author.id}" AND name = "menu"`) //deletes the menu cooldown if canceled
                                    if(reacted == "y"){message.channel.send(botye+` ${petrow.name}'s **${usrabilityrow.name}**-Ability was improved!`)}
                                    //deletes the user message and ends the previous collector
                                    message.delete().catch(allerrors)
                                    collector2.stop()
                                    //deletes the menu cooldown
                                    sql.run(`DELETE FROM usercooldowns WHERE user = "${message.author.id}" AND name = "menu"`).catch(allerrors)
                                })
                            }
                        }
                    })
                    collector2.on('end', async collected => {
                        choose2msg.delete().catch(allerrors)
                        if(reacted == "n"){message.channel.send(`<@${message.author.id}>, your menu timed out!`).catch(allerrors)} //sends a notification if thee user didnt react
                        if(reacted == "c") return sql.run(`DELETE FROM usercooldowns WHERE user = "${message.author.id}" AND name = "menu"`) //deletes the menu cooldown if canceled
                        //deletes the user message and ends the previous collector
                        message.delete().catch(allerrors)
                        collector.stop()
                        //deletes the menu cooldown
                        sql.run(`DELETE FROM usercooldowns WHERE user = "${message.author.id}" AND name = "menu"`).catch(allerrors)
                    })
                }

            }
            else if(args2[0] == "4"){//user chose to view an existing ability
                if(petabilities.length < 1){
                    //if the pet doesn't have any abilities, delete the user message, send an error message and delete that after 5 seconds
                    message.delete().catch(allerrors)
                    noabilitiesmsg = await errmsg(`Your pet doesn't have any abilities!`)
                    await sleep(5000).then(() => noabilitiesmsg.delete()).catch(allerrors)
                }
                else{
                    //deletes the users message, then the first collector
                    message.delete().catch(allerrors)
                    reacted = "y"; collector.stop()

                    i = 1
                    availableabilities = ``
                    for(ability of petabilities){ //using for of loop to make sure it runs before the next part so the variables update
                        let row = await sql.get(`SELECT * FROM userabilities WHERE LOWER(name) = "${ability}" AND petowner = "${message.author.id}" AND pet = "${petrow.name}" COLLATE NOCASE`)
                        if(!row) return
                        //the ability gets added to a variable for display in the menu
                        availableabilities = availableabilities + `[${i}] ${row.name} (XP: ${row.xp}, Points: ${row.points}, Level: ${row.lvl})\n`
                        i++
                    }
                    let syntax = `py`   
                    if(i < 2) {availableabilities = `: Your pet doesn't have any abilities at this time! :\n`; syntax = `asciidoc`} //if the pet doesn't have any abilities, change the message and it's colors
                    
                    //new collector:
                    reacted = "n"
                    choose2msg = await message.channel.send(`\`\`\`${syntax}\nWhich ability do you want to view?\n\n${availableabilities}\nType the respective number beside the ability you want to view.\nType 'cancel' to exit the menu.\`\`\``).catch(allerrors)
                    const collector2 = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 30000 });; //collects msgs from the message author for the next 30 seconds
                    collector2.on('collect', async (message) => {//run this after a second message from the user is detected

                        let args3 = message.cleanContent.slice().trim().split(/ +/g); //new arguments from the third message
                        if(args3[0].toLowerCase() == 'cancel') {reacted = "y"; collector2.stop()} //exits the collector if the user cancels
                        else if(isNaN(parseInt((args3[0])) || parseInt(args3[0]) > petabilities.length)) return //ignores all messages that aren't numbers or numbers higher than the ones displayed in the message
                        else{
                            let name = petabilities[parseInt(args3[0]-1)] //gets the ability name from an array defined earlier via the number the user inputs
                            let usrabrow = await sql.get(`SELECT * FROM userabilities WHERE LOWER(name) = ? AND pet = "${petrow.name}" AND petowner = "${message.author.id}"`, name) //gets the user ability row with the respective name
                            if(!usrabrow) return errmsg(` An error occured while accessing the ability. Please try again later`).then(() => collector2.stop())
                            let abrow = await sql.get(`SELECT * FROM abilities WHERE LOWER(name) = ?`, name) //gets the ability row with the respective name
                            if(!abrow) return errmsg("There was an error with the ability. Please try again.").then(() => collector2.stop())
                            //variables for storing the different damage values in the correct way (gets multiplied by 100 and a % sign added, since it'S %-based)
                            let admgs = `${usrabrow.dmgs*100}%` //regular ability damage vs small creatures
                            let admgm = `${usrabrow.dmgm*100}%` //regular ability damage vs medium creatures
                            let admgl = `${usrabrow.dmgl*100}%` //regular ability damage vs leviathan creatures
                            let sdmgs = `${usrabrow.specialvals*100}%` //special ability damage vs small creatures
                            let sdmgm = `${usrabrow.specialvalm*100}%` //special ability damage vs medium creatures
                            let sdmgl = `${usrabrow.specialvall*100}%` //special ability damage vs leviathan creatures

                            //variable for storing the stamina in a readable way (to ensure if it's %-based, it changes the display way)
                            let staminastring = usrabrow.stamina >= 1 ? `${usrabrow.stamina}﻿total` : `${(usrabrow.stamina)*100}%﻿of﻿max.﻿stamina`
                            
                            message.delete().catch(allerrors)//deletes the user's message
                            
                            //sets the bot to typing mode, so the user knows the command worked
                            message.channel.startTyping();
                            // --- composes the ability image
                            //determines if a specific image for the ability type exists, if not just use a basic one
                            let abilitypath = fs.existsSync(`../Al-An/assets/menus/ability_${abrow.type.toLowerCase()}.jpg`) ? `../Al-An/assets/menus/ability_${abrow.type.toLowerCase()}.jpg` : `../Al-An/assets/menus/ability.jpg`
                            //adds all images that are required to an array
                            var images = [abilitypath, `../Al-An/assets/bars/abilities/${usrabrow.lvl}.png`, `../Al-An/assets/abilities/${abrow.name}.png`]
                            var jimps = [] //empty array to store the jimps later
                            for (var i = 0; i < images.length; i++){
                                jimps.push(jimp.read(images[i])) //pushes the processed images to the empty array
                            }
                            await Promise.all(jimps).then(function(data) {
                                return Promise.all(jimps) //waits for the promise to be resolved
                            }).then(async function(data){
                                // --- changes the color of the progress bar for each type of ability
                                let degree = abrow.type == "Healing" ? -40 : abrow.type == "Damage" ? -180 : abrow.type == "Torpor" ? 80 : 0
                                data[1].color([{apply: 'hue', params: [degree]}]);
                                //changes the size of the ability icon to fit the frame
                                data[2].resize(150, 150)

                                //this is where we composit the images together
                                data[0].composite(data[1], 10, 10) //adds the ability frame
                                data[0].composite(data[2], 80, 68) //adds the ability icon
                                // --- add any text that we need
                                await jimp.loadFont(`../Al-An/assets/fonts/abilityfont.fnt`).then(async abilityfont => {
                                    //loads a slightly smaller font variant
                                    var abilityfont_m = await jimp.loadFont(`../Al-An/assets/fonts/abilityfont_m.fnt`)
                                    //loads the smallest font variant
                                    var abilityfont_s = await jimp.loadFont(`../Al-An/assets/fonts/abilityfont_s.fnt`)
                                    
                                    // --- prints all the values and text on the image
                                    // --- adds the damage amounts, changes font size for larger numbers
                                    data[0].print(usrabrow.dmgs < 1 ? abilityfont_m : abilityfont_s, 825, 375, {text: `${admgs}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_CENTER}, 0, 0) //adds ability damage vs small
                                    data[0].print(usrabrow.dmgm < 1 ? abilityfont_m : abilityfont_s, 990, 375, {text: `${admgm}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_CENTER}, 0, 0) //adds ability damage vs medium
                                    data[0].print(usrabrow.dmgl < 1 ? abilityfont_m : abilityfont_s, 1150,375, {text: `${admgl}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_CENTER}, 0, 0) //adds ability damage vs leviathan
                                    data[0].print(usrabrow.specialvals < 1 ? abilityfont_m : abilityfont_s, 825, 515, {text: `${sdmgs}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_CENTER}, 0, 0) //adds special damage vs small
                                    data[0].print(usrabrow.specialvalm < 1 ? abilityfont_m : abilityfont_s, 990, 515, {text: `${sdmgm}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_CENTER}, 0, 0) //adds special damage vs medium
                                    data[0].print(usrabrow.specialvall < 1 ? abilityfont_m : abilityfont_s, 1150,515, {text: `${sdmgl}`, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_CENTER}, 0, 0) //adds special damage vs leviathan
                                    // --- adds all other text
                                    //only adds the ability type if it's different from the predetermined ones: (predetermined ones have it on the basic image already)
                                    if(!fs.existsSync(`../Al-An/assets/menus/ability_${abrow.type.toLowerCase()}.jpg`)){
                                        data[0].print(abilityfont, 205, 425, {text: `${abrow.type}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                    }
                                    data[0].print(abilityfont, 205, 560, {text: `${usrabrow.effect}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                    data[0].print(abilityfont, 205, 700, {text: `${usrabrow.rounds}﻿rounds`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                    data[0].print(abilityfont, 205, 845, {text: `${staminastring}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                    
                                    //splits the description into multiple strings, each in their own line so they don't go out of the frame
                                    let desccoord = 995 
                                    let desc = abrow.desc.replace(/ /g, `﻿`) //replaces spaces with an invisible character because jimp creates a new line for every normal space
                                    //changes the font if the description is too long, three possible sizes
                                    let descfont = desc.length > 100 ? abilityfont_s : desc.length > 75 ? abilityfont_m : abilityfont
                                    //splits the string every 25/30/40 characters (depending on font size) or at a space closest to them
                                    let descparts = descfont == abilityfont ? desc.match(/.{1,25}(\s|$)/g) : descfont == abilityfont_m ? desc.match(/.{1,30}(\s|$)/g) : desc.match(/.{1,38}(\s|$)/g)
                                    //cycles through each part and adds it to the image, each one a little lower than the previous one
                                    for(i = 0; i < descparts.length; i++){
                                        data[0].print(descfont, 200, desccoord, {text: `${descparts[i]}`, alignmentX: jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: jimp.VERTICAL_ALIGN_BOTTOM}, 0, 0)
                                        //if the font is large, have a larger space in between lines than for a smaller font:
                                        switch(descfont){
                                            case abilityfont   : {desccoord += 80; break}
                                            case abilityfont_m : {desccoord += 65; break}
                                            default            : {desccoord += 50; break}
                                        }
                                    }
                                })
                                //saves the composited image to a buffer
                                var image = await new Discord.Attachment(await data[0].getBufferAsync(jimp.MIME_PNG))
                                //sends the buffer as an attachment to a message
                                await message.channel.send(`**${petrow.name}**'s lvl. ${usrabrow.lvl} ${abrow.name} ability:`, image).catch(allerrors)
                                //resets the typing status
                                message.channel.stopTyping();
                            })
                            //stops the collector   
                            reacted = "y"; collector2.stop()
                        }
                    })
                    collector2.on('end', async collected => {
                        choose2msg.delete().catch(allerrors)
                        if(reacted == "n"){message.channel.send(`<@${message.author.id}>, your menu timed out!`).catch(allerrors)} //sends a notification if thee user didnt react
                        if(reacted == "c") return sql.run(`DELETE FROM usercooldowns WHERE user = "${message.author.id}" AND name = "menu"`) //deletes the menu cooldown if canceled
                        //deletes the menu cooldown
                        sql.run(`DELETE FROM usercooldowns WHERE user = "${message.author.id}" AND name = "menu"`).catch(allerrors)
                    })
                }
            }
            else if(args2[0] == "5"){//user chose to unlearn an existing ability
                if(petabilities.length < 1){
                    //if the pet doesn't have any abilities, delete the user message, send an error message and delete that after 5 seconds
                    reacted = "y"
                    message.delete().catch(allerrors)
                    noabilitiesmsg = await errmsg(`Your pet doesn't have any abilities!`)
                    await sleep(5000).then(() => noabilitiesmsg.delete()).catch(allerrors)
                }
                else{
                    //deletes the users message, then the first collector
                    message.delete().catch(allerrors)
                    reacted = "y"; collector.stop()

                    i = 1
                    availableabilities = ``
                    for(ability of petabilities){ //using for of loop to make sure it runs before the next part so the variables update
                        let row = await sql.get(`SELECT * FROM userabilities WHERE LOWER(name) = "${ability}" AND petowner = "${message.author.id}" AND pet = "${petrow.name}" COLLATE NOCASE`)
                        if(!row) return
                        //the ability gets added to a variable for display in the menu
                        availableabilities = availableabilities + `[${i}] ${row.name} (XP: ${row.xp}, Points: ${row.points}, Level: ${row.lvl})\n`
                        i++
                    }
                    let syntax = `py`   
                    if(i < 2) {availableabilities = `: Your pet doesn't have any abilities at this time! :\n`; syntax = `asciidoc`}//if the pet doesn't have any abilities, change the message and it's colors

                    //new collector:
                    reacted = "n"
                    choose2msg = await message.channel.send(`\`\`\`${syntax}\nWhich ability do you want to unlearn?\n\n${availableabilities}\nType the respective number beside the ability you want to remove.\nType 'cancel' to cancel the training.\`\`\``).catch(allerrors)
                    const collector2 = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 30000 });; //collects msgs from the message author for the next 60 seconds
                    collector2.on('collect', async (message) => {//run this after a second message from the user is detected

                        let args3 = message.cleanContent.slice().trim().split(/ +/g); //new arguments from the third message
                        if(args3[0].toLowerCase() == 'cancel') {reacted = "y"; collector2.stop()} //exits the collector if the user cancels
                        else if(isNaN(parseInt((args3[0])) || parseInt(args3[0]) > petabilities.length)) return //ignores all messages that aren't numbers or numbers higher than the ones displayed in the message
                        else{
                            let name = petabilities[parseInt(args3[0]-1)] //gets the ability name from an array defined earlier via the number the user inputs
                            let abilityrow = await sql.get(`SELECT * FROM abilities WHERE LOWER(name) = ?`, name) //gets the ability row with the respective name
                            if(!abilityrow) return errmsg(`An error occured while accessing the ability. Please try again later`).then(() => collector2.stop()).catch(allerrors)

                            //updates the abilities, then deletes the users message and stops the collector, sending a confirmation message
                            sql.run(`DELETE FROM userabilities WHERE name = "${abilityrow.name}" AND petowner = "${message.author.id}" AND pet = "${petrow.name}"`) //deletes the ability
                            reacted = "y"
                            collector2.stop();
                            message.channel.send(`\`\`\`css\nTraining successful:\n[${petrow.name} unlearned ${abilityrow.name}!]\`\`\``).catch(allerrors) //sends a confirmation message
                        }
                    })
                    collector2.on('end', async collected => {
                        choose2msg.delete().catch(allerrors)
                        if(reacted == "n"){message.channel.send(`<@${message.author.id}>, your menu timed out!`).catch(allerrors)} //sends a notification if thee user didnt react
                        sql.run(`DELETE FROM usercooldowns WHERE user = "${message.author.id}" AND name = "menu"`) //deletes the menu cooldown
                        //deletes the user message
                        message.delete().catch(allerrors)
                        //deletes the menu cooldown
                        sql.run(`DELETE FROM usercooldowns WHERE user = "${message.author.id}" AND name = "menu"`).catch(allerrors)
                    })
                }
            }
        })
        collector.on('end', async collected => {
            //checks if the user reacted
            if(reacted == "n"){message.channel.send(`<@${message.author.id}>, your menu timed out!`).catch(allerrors)} //sends a notification if the user didnt react
            choosemsg.delete().catch(allerrors)
            //deletes the menu coodown
            removecooldown(`menu`, message.author.id)
        })
    }

    //────────── new command ──────────

    else if(petcmd== "play"){
        //checks if a pet was specified and if it exists and if it's already at full happiness
        if(!petargs[0]) return errmsg(`Please specify which pet you want to play with.`).catch(allerrors)
        let petrow = await sql.get(`SELECT * FROM pets WHERE owner = "${message.author.id}" AND name = ? COLLATE NOCASE`, `${petargs[0].toLowerCase()}`)
        if(!petrow) return errmsg(`You don't have a pet called ${petargs[0]}.`).catch(allerrors)
        else if(petrow.happiness == petrow.maxhappiness) return errmsg(`Your pet is already happy!`).catch(allerrors)
        else if(petrow.ko == 1) return errmsg(`You can't play with an unconscious pet!`)

        //checks if the user has played with this pet in the last 30 seconds, if not, add a new cooldown called "playPETNAME" to identify it
        if(await checkcooldown(`play${capfirst(petargs[0])}`, message.author.id) > 0) return errmsg(`Please wait ${await checkcooldown(`play${capfirst(petargs[0])}`, message.author.id)} before playing with ${petrow.name} again.`)
        else {await newcooldown(`play${capfirst(petargs[0])}`, 30, message.author.id)}

        let happinessinc = randomInt(50) + 25
        let newhappiness = happinessinc + petrow.happiness
        if(newhappiness > petrow.maxhappiness){newhappiness = petrow.maxhappiness}

        let playemb = new Discord.RichEmbed()
        .setTitle(botye+` You played with ${petrow.name}!`)
        .addField(`Results:`, `+${newhappiness-petrow.happiness} happiness\n (Total: ${newhappiness})`)
        .setColor(`77FF77`)
        .attachFile(`../Al-An/assets/creatures/${petrow.species}/${petrow.skin}.png`)
        .setThumbnail(`attachment://${petrow.skin}.png`)
        //updates the stat and sends a confirmation message
        sql.run(`UPDATE pets SET happiness = "${newhappiness}" WHERE owner = "${message.author.id}" AND name = "${petrow.name}"`)
        message.channel.send(playemb).catch(allerrors)
    }
}

else if(cmd == "reset"){//resets a user's profile
    
    // --- checks if the user is still on cooldown:
    if(await checkcooldown(`reset`, message.author.id) > 0) return errmsg(`You already have a pending reset request!`)
    else {await newcooldown(`reset`, 20, message.author.id)}

    let code = `${randomInt(10)-1}${randomInt(10)-1}${randomInt(10)-1}${randomInt(10)-1}`
    let firstmsgauthor = message.author
    let resemb = new Discord.RichEmbed()
    .setTitle(`Reset Profile?`)
    .setDescription(`Are you sure you want to reset your profile?\n\n__This will reset **all** your__\n• Money & Crystals\n• Pets & their abilities\n• Backgrounds\n• Items\n• Bases\n\nTo exit type "exit"`)
    .setColor(`#448844`)
    .setFooter(`To reset your profile please type "confirm ${code}".`)
    msg = await message.channel.send(resemb)

    const collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 20000 });
    let reacted = 0
    collector.on('collect', async message => {
        //ignores other user's messages
        if(message.author.id != firstmsgauthor.id) return
        //gets the arguments on the new message
        let args2 = message.cleanContent.trim().split(/ +/g);
        if(args2[0] == "exit"){
            reacted = 2
            collector.stop();
        }
        else if(args2[0] != `confirm`) return
        else if(args2[1] != code) return
        else{
            reacted = 1
            collector.stop();
        }
    })
    collector.on('end', async collected => {
        if (reacted == 0){
            //if the user didn't post anything, close the menu
            msg.edit(resemb.setDescription(`${firstmsgauthor.username}'s menu timed out.`))
            msg.edit(resemb.setFooter(`User didn't respond`))
        }
        else if(reacted==1){
            //variable to store any errors that occur
            let errors = ``
            //if the user chose to reset the profile, delete all data
            await sql.run(`DELETE FROM pets WHERE owner = "${firstmsgauthor.id}"`).catch((error) => {console.log(error);errors+=`• ${error}\n`})
            await sql.run(`DELETE FROM userbackgrounds WHERE owner = "${firstmsgauthor.id}"`).catch((error) => {errors+=`• ${error}\n`})
            await sql.run(`DELETE FROM userabilities WHERE petowner = "${firstmsgauthor.id}"`).catch((error) => {errors+=`• ${error}\n`})
            await sql.run(`DELETE FROM useritems WHERE owner = "${firstmsgauthor.id}"`).catch((error) => {errors+=`• ${error}\n`})
            await sql.run(`DELETE FROM users WHERE userId = "${firstmsgauthor.id}"`).catch((error) => {errors+=`• ${error}\n`})
            if(errors == ``){
                msg.edit(resemb.setDescription(botye+` Profile reset.`))
                msg.edit(resemb.setColor(`77FF77`))
                msg.edit(resemb.setFooter(`No errors occurred.`))
            }
            else{
                msg.edit(resemb.setDescription(botex+` Profile may not have reset!`))
                msg.edit(resemb.setColor(`#ffab77`))
                msg.edit(resemb.setFooter(errors))
            }
        }
        else{
            //if the user chose to exit, close the menu
            msg.edit(resemb.setDescription(botex+`Exited.`))
            msg.edit(resemb.setFooter(`No errors occurred.`))
        }
        removecooldown(`reset`, message.author.id)
    })
}

else if(cmd == "invite"){
    //sends an invite (currently disabled)
    errmsg(`Sorry, this bot is currently in closed beta!`)
}

else if(cmd == "version"){
    message.channel.send(`I'm currently running on version **[BETA] 1.0**`)
}

else if (cmd == "cmds" || cmd == "commands"){//sends a list of available commands
    message.channel.send(`\`\`\`asciidoc
== List of available commands ==

Bot Prefix  :: ${config.prefix2} 

== Basic ==

${config.prefix2}background(s)   :: Buy or set a profile background
${config.prefix2}bio             :: Set your bio
${config.prefix2}credits         :: View the credits
${config.prefix2}daily           :: Get your daily credits
${config.prefix2}help            :: Views the help menu
${config.prefix2}inv(entory)     :: Shows your inventory
${config.prefix2}item            :: Sell or use items
${config.prefix2}notif(ication)s :: Displays your new notifications
${config.prefix2}prof(ile)       :: Displays a users profile
                    & removes all data
${config.prefix2}shop (/buy)     :: Opens a shop menu
${config.prefix2}tame(s)         :: View or feed your tames
${config.prefix2}wiki            :: View a creatures, items
                    or biomes info

== Pet commands ==

${config.prefix2}pet hunt        :: Go hunting with your pet to find
                    various items or encounter creatures
${config.prefix2}pet level       :: Upgrade your pet's stats
${config.prefix2}pet list        :: Lists all of your pets
${config.prefix2}pet name        :: Rename your pet
${config.prefix2}pet play        :: Increases a pet's happiness
${config.prefix2}pet train       :: Train abilities for your pet
${config.prefix2}pet view        :: Displays your pet's profile

== Utility ==
${config.prefix2}c(om)m(an)ds    :: View this menu
${config.prefix2}info (/support) :: Displays info about the bot
${config.prefix2}invite          :: Invite the bot to your server
${config.prefix2}ping            :: Pong!
${config.prefix2}reset           :: Resets your progress
${config.prefix2}version         :: View the bot's current version


To view syntax help for commands, use ${config.prefix2}help
To view help for specific commands, do ${config.prefix2}help <command>\`\`\``)
}

else if (cmd == "help"){//displays information about specific commands
    if (!args[0]) return message.channel.send(`\`\`\`asciidoc
Do \`${config.prefix2}commands\` to get an overview of all available commands\nor use \`${config.prefix2}help <command>\` for more information on a specific command.\n\n== Syntax ==\n-command <replace with value|or this value> (<optional value>)
\`\`\``).catch(allerrors)
    else if(!allcmds.includes(args[0])) return errmsg(`That command doesn't exist!`)
	else {
		switch (args[0]){
            case"backgrounds":
            case"background": //alias
                message.channel.send(`Use \`${config.prefix2}backgrounds <category> (<<|>> <amount>)\` to view all available backgrounds from a category (cheaper or more expensive than a specific amount of coins).\nExample: **${config.prefix2}backgrounds abstract > 5000**\n\nReact to change pages, buy the background or set it as your current one!`).catch(allerrors)
                break;
            case"bio":
                message.channel.send(`Use \`${config.prefix2}bio <max 85 characters>\` to change your bio.`).catch(allerrors)
                break;
            case"item":
            case"sell": //subcategory of item actions
            case"use":  //subcategory of item actions
                let ihemb = new Discord.RichEmbed()
                .setTitle(`How to use the item command`)
                .setColor(`448844`)
                //DISABLED .addField(`Using items:`, `Use \`${config.prefix2}item use <item name> (<pet|user>) <amount>\` to use an item on a pet or user`)
                .addField(`Selling items:`, `Use \`${config.prefix2}item sell <item|category-name> <amount|'all'>\` to sell a specified amount of items in a category/with a specific name.`)
                message.channel.send(ihemb).catch(allerrors)
                break;
            case"level":
            case"lvl": //alias
                message.channel.send(`Use \`${config.prefix2}pet level <name>\` to open the leveling menu. You can either use reactions or the command specified in the menu to upgrade a stat.`)
                break;
            case"profile":
            case"prof":
                message.channel.send(`Use \`${config.prefix2}profile (<user>)\` or \`${config.prefix2}prof (<user>)\` to display a users profile.`).catch(allerrors)
                break;
            case"shop":
                message.channel.send(`Use \`${config.prefix2}shop <category>\` to view items from a specific category you can buy.\n\nIn an open shop, do \`${config.prefix2}buy <item name|ID> <amount> (<currency>)\` to buy a specific item\nor type \`exit\` to close the shop.`).catch(allerrors)
                break;
            case"tames":
                message.channel.send(`Use \`${config.prefix2}tames <feed|view>\` to force-feed a tame an item or to view one of your ongoing tames`).catch(allerrors)
                break;
            case"pet":
            case"name": //subcategory of pet menu
            case"view": //subcategory of pet menu
            case"feed": //subcategory of pet menu
            case"list": //subcategory of pet menu
            case"train"://subcategory of pet menu
            case"play": //subcategory of pet menu
                message.channel.send(`\`\`\`asciidoc
== The pet command has various different sub-commands ==\n\n
Use "${config.prefix2}pet feed <name> <item>"       :: to feed a specific pet using a specific type of food\n
Use "${config.prefix2}pet hunt <name> <location>"   :: to hunt for resources in a specific biome ('${config.prefix2}help hunt' for more info)\n
Use "${config.prefix2}pet list (<user>)"            :: to list all pets of a specific user\n
Use "${config.prefix2}pet name <OldName> <NewName>" :: to rename one of your pets\n
Use "${config.prefix2}pet level <name>"             :: to improve a pet's stats ('${config.prefix2}help level' for more info)\n
Use "${config.prefix2}pet play <name>               :: to play with one of your pets to increase their happiness\n
Use "${config.prefix2}pet train <name>"             :: to learn, improve, level or unlearn a pet's abilities)\n
Use "${config.prefix2}pet view <name> (<user>)"     :: to view one of your or someone else's pets
                \`\`\``).catch(allerrors)
                break;
            default:
            message.channel.send(botno + `There's no help available for this command because it either doesn't require additional arguments or doesn't exist!`).catch(allerrors)
        }
    }
}

//#region Dev commands
else if (cmd == "item.add"){
    if(message.author.id != "180995521622573057") return message.channel.send(botno + " You are not authorized for this action!").catch(allerrors)
    //the item table
    sql.get(`SELECT * FROM items WHERE name = "${args[0]}" COLLATE NOCASE`).then((row) =>{
        if(!row){
            sql.run(`INSERT INTO items (name, type, effect, effectval, saturation, time, value, price, cprice, category, max, useable, sellable, desc, emoji) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args[0], args[1], args[2], args[3], args[4], 0, args[5], args[6], args[7], args[8], args[9], args[10], args[11], args.slice(13).join(" "), args[12])
            message.channel.send(`${botye} Created item! Name: ${args[0]}\nType: ${args[1]}\nEffect: ${args[2]}\nEffectval: ${args[3]}\nSaturation: ${args[4]}\nTime: 0\nValue:${args[5]}\nPrice: ${args[6]}\nCprice: ${args[7]}\nTime: 0\nCategory: ${args[8]}\nMax: ${args[9]}\nUseable by: ${args[10]}\nSellable: ${args[11]==1?`yes`:`no`}\nEmoji: ${args[12]}\nDescription: ${args.slice(13).join(" ")}`)
        }
        else return message.channel.send(`${botno} Item already exists!`)
    }).catch(() =>{
        sql.run("CREATE TABLE IF NOT EXISTS items (name TEXT, type TEXT, effect TEXT, effectval INTEGER, saturation INTEGER, time INTEGER, value INTEGER, price INTEGER, cprice INTEGER, category TEXT, max INTEGER, useable TEXT, sellable INTEGER, desc TEXT, emoji TEXT)").then(()=>{
            sql.run(`INSERT INTO items (name, type, effect, effectval, saturation, time, value, price, cprice, category, max, useable, sellable, desc, emoji) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args[0], args[1], args[2], args[3], args[4], 0, args[5], args[6], args[7], args[8], args[9], args[10], args[11], args.slice(13).join(" "), args[12])
            message.channel.send(`${botye} Created item! Name: ${args[0]}\nType: ${args[1]}\nEffect: ${args[2]}\nEffectval: ${args[3]}\nSaturation: ${args[4]}\nTime: 0\nValue:${args[5]}\nPrice: ${args[6]}\nCprice: ${args[7]}\nTime: 0\nCategory: ${args[8]}\nMax: ${args[9]}\nUseable by: ${args[10]}\nSellable: ${args[11]==1?`yes`:`no`}\nEmoji: ${args[12]}\nDescription: ${args.slice(13).join(" ")}`)
        })
    })
}

else if (cmd == "loc.add"){
    if(message.author.id != "180995521622573057") return message.channel.send(botno + " You are not authorized for this action!").catch(allerrors)

    var name = args[0].replace(/-/g, " ")
    sql.get(`SELECT * FROM locations WHERE name = "${name.toLowerCase()}" COLLATE NOCASE`).then((row) =>{
        if(!row){
            sql.run(`INSERT INTO locations (name, lvl, class, id, depth1, depth2) VALUES (?, ?, ?, ?, ?, ?)`, name, args[1], args[2], args[3], args[4], args[5]).catch(allerrors)
            message.channel.send(botye + `Created **${name}** (id: ${args[3]}) with a a level reqirement of \`${args[1]}\`, a class requirement of \`${args[2]}\` and a depth of ${args[4]}-${args[5]}`)
        }   
        else return message.channel.send(`${botno} Biome already exists!`)
    }).catch(() =>{
        sql.run(`CREATE TABLE IF NOT EXISTS locations (name TEXT, lvl INTEGER, class TEXT, id INTEGER, depth1 INTEGER, depth2 INTEGER)`).then(() => {
            sql.run(`INSERT INTO locations (name, lvl, class, id, depth1, depth2) VALUES (?, ?, ?, ?, ?, ?)`, name, args[1], args[2], args[3], args[4], args[5]).catch(allerrors)
            message.channel.send(botye + `Created **${name}** (id: ${args[3]}) with a a level reqirement of \`${args[1]}\`, a class requirement of \`${args[2]}\` and a depth of ${args[4]}-${args[5]}`)
        })  
    })
}

else if (cmd == "locres.add"){
    if(message.author.id != "180995521622573057") return message.channel.send(botno + " You are not authorized for this action!").catch(allerrors)

    if(!args[0]) return
    if(!args[1]) return
    if(!args[2]) args[2] = 0
    if(!args[3]) args[3] = `Average`
    sql.get(`SELECT * FROM locres WHERE id = "${args[0]}" AND name = "${args[1].toLowerCase()}" COLLATE NOCASE`).then((row) =>{
        if(!row){
            sql.run(`INSERT INTO locres (id, name, chance, category) VALUES (?, ?, ?, ?)`, args[0], args[1], args[2]).catch(allerrors)
            message.channel.send(botye + `Added **${args[1]}** (${args[3]}) to ID ${args[0]} with a a chance of \`${args[2]}\`.`)
        }   
        else return message.channel.send(`${botno} Resource already exists in this biome!`)
    }).catch(() =>{
        sql.run(`CREATE TABLE IF NOT EXISTS locres (id INTEGER, name TEXT, chance INTEGER, category TEXT)`).then(() => {
            sql.run(`INSERT INTO locres (id, name, chance, category) VALUES (?, ?, ?, ?)`, args[0], args[1], args[2]).catch(allerrors)
            message.channel.send(botye + `Added **${args[1]}** (${args[3]}) to ID ${args[0]} with a a chance of \`${args[2]}\`.`)
        })
    })
}

else if (cmd == "locenc.add"){
    if(message.author.id != "180995521622573057") return message.channel.send(botno + " You are not authorized for this action!").catch(allerrors)

    if(!args[0]) return
    if(!args[1]) return
    if(!args[2]) args[2] = 0
    sql.get(`SELECT * FROM locenc WHERE id = "${args[0]}" AND name = "${args[1].toLowerCase()}" COLLATE NOCASE`).then((row) =>{
        if(!row){
            sql.run(`INSERT INTO locenc (id, name, chance) VALUES (?, ?, ?)`, args[0], args[1], args[2]).catch(allerrors)
            message.channel.send(botye + `Added **${args[1]}** to ID ${args[0]} with a a chance of \`${args[2]}\`.`)
        }   
        else return message.channel.send(`${botno} Encounter already exists in this biome!`)
    }).catch(() =>{
        sql.run(`CREATE TABLE IF NOT EXISTS locenc (id INTEGER, name TEXT, chance INTEGER)`).then(() => {
            sql.run(`INSERT INTO locenc (id, name, chance) VALUES (?, ?, ?)`, args[0], args[1], args[2]).catch(allerrors)
            message.channel.send(botye + `Added **${args[1]}** to ID ${args[0]} with a a chance of \`${args[2]}\`.`)
        })
    })
}

else if (cmd == "background.add"){
    if(message.author.id != "180995521622573057") return message.channel.send(botno + " You are not authorized for this action!").catch(allerrors)
    //the item table
    sql.get(`SELECT * FROM backgrounds WHERE url = "${args[1]}"`).then((row) =>{
        if(!row){
            sql.run(`INSERT INTO backgrounds (id, category, url, mcost, ccost) VALUES (?, ?, ?, ?, ?)`, 0, args[0], args[1], args[2], args[3])
            message.channel.send(`${botye} Created background!\nID: 0\nURL: ${args[1]}\nMoney cost: ${args[2]}\nCrystal cost: ${args[3]}\nCategory: ${args[0]}`)
        }
        else return message.channel.send(`${botno} Background already exists!`)
    }).catch(() =>{
        sql.run("CREATE TABLE IF NOT EXISTS backgrounds (id INTEGER, category TEXT, url TEXT, mcost INTEGER, ccost INTEGER)").then(()=>{
            sql.run(`INSERT INTO backgrounds (id, category, url, mcost, ccost) VALUES (?, ?, ?, ?, ?)`, 0, args[0], args[1], args[2], args[3])
            message.channel.send(`${botye} Created background!\nID: 0\nURL: ${args[1]}\nMoney cost: ${args[2]}\nCrystal cost: ${args[3]}\nCategory: ${args[0]}`)
        })
    })
}

else if (cmd == "ability.add"){
    if(message.author.id != "180995521622573057") return message.channel.send(botno + " You are not authorized for this action!").catch(allerrors)

    let useableon = args[4].replace(/,/g, " ")
    let useableby = args[5].replace(/,/g, " ")
    let descargs = message.cleanContent.slice(config.prefix.length).trim().split(/\|+/g);

    //the item table
    sql.get(`SELECT * FROM abilities WHERE name = "${args[0]}" AND class = "${args[1]}"`).then((row) =>{
        if(!row){
            sql.run(`INSERT INTO abilities (name, class, type, dmgtype, lvl, useableon, useableby, dmgs, dmgm, dmgl, healths, healthm, healthl, stamina, effect, special, specialvals, specialvalm, specialvall, rounds, emojiid, dmgsinc, dmgminc, dmglinc, healthsinc, healthminc, healthlinc, staminainc, specialvalsinc, specialvalminc, specialvallinc, roundsincreq, desc, fightdesc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args[0], args[1], args[2], args[3], useableon, useableby, args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24], args[25], args[26], args[27], args[28], args[29], args[30], args[31], descargs[1], descargs[2])
            message.channel.send(`${botye} Created ability!\n__Name__: ${args[0]}\n__Class__: ${args[1]}\n__Type__: ${args[2]}\n__Damage Type__: ${args[3]}\n__Level requirement__: ${args[4]}\n__Useable on__: ${args[5].replace(/,/g, ", ")}\n__Useable by__: ${args[6].replace(/,/g, ", ")}\n__Damage__: Small[${args[7]}], Medium[${args[8]}], Leviathan[${args[9]}] \`(+${args[21]}|+${args[22]}|+${args[23]})\`\n__Healthchange__: Small[${args[10]}], Medium[${args[11]}], Leviathan[${args[12]}] \`(+${args[24]}|+${args[25]}|+${args[26]})\`\n__Stamina cost__: ${args[13]<1 ? `${args[13]*100}%` : args[13]} \`(${args[27]})\`\n__Effect__: ${args[14]}\n__Special__: ${args[15]}\n__Specialvalue__: Small[${args[16]}], Medium[${args[17]}], Leviathan[${args[18]}] \`(+${args[28]}|+${args[29]}|+${args[30]})\`\n__Rounds__: ${args[19]} \`(+1 - requires ${args[31]} points)\`\n__EmojiID__: ${args[20]}\n__Description__: *${descargs[1]}*\n__Fightdescription__: **${descargs[2]}**`)
        }
        else return message.channel.send(`${botno} Ability already exists!`)
    }).catch(() =>{
        sql.run("CREATE TABLE IF NOT EXISTS abilities (name TEXT, class TEXT, type TEXT, dmgtype TEXT, lvl INTEGER, useableon TEXT, useableby TEXT, dmgs INTEGER, dmgm INTEGER, dmgl INTEGER, healths INTEGER, healthm INTEGER, healthl INTEGER, stamina INTEGER, effect TEXT, special TEXT, specialvals INTEGER, specialvalm INTEGERR, specialvall INTEGER, rounds INTEGER, emojiid TEXT, dmgsinc INTEGER, dmgminc INTEGER, dmglinc INTEGER, healthsinc INTEGER, healthminc INTEGER, healthlinc INTEGER, staminainc INTEGER, specialvalsinc INTEGER, specialvalminc INTEGER, specialvallinc INTEGER, roundsincreq INTEGER, desc TEXT, fightdesc TEXT)").then(()=>{
            sql.run(`INSERT INTO abilities (name, class, type, dmgtype, lvl, useableon, useableby, dmgs, dmgm, dmgl, healths, healthm, healthl, stamina, effect, special, specialvals, specialvalm, specialvall, rounds, emojiid, dmgsinc, dmgminc, dmglinc, healthsinc, healthminc, healthlinc, staminainc, specialvalsinc, specialvalminc, specialvallinc, roundsincreq, desc, fightdesc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args[0], args[1], args[2], args[3], useableon, useableby, args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24], args[25], args[26], args[27], args[28], args[29], args[30], args[31], descargs[1], descargs[2])
            message.channel.send(`${botye} Created ability!\n__Name__: ${args[0]}\n__Class__: ${args[1]}\n__Type__: ${args[2]}\n__Damage Type__: ${args[3]}\n__Level requirement__: ${args[4]}\n__Useable on__: ${args[5].replace(/,/g, ", ")}\n__Useable by__: ${args[6].replace(/,/g, ", ")}\n__Damage__: Small[${args[7]}], Medium[${args[8]}], Leviathan[${args[9]}] \`(+${args[21]}|+${args[22]}|+${args[23]})\`\n__Healthchange__: Small[${args[10]}], Medium[${args[11]}], Leviathan[${args[12]}] \`(+${args[24]}|+${args[25]}|+${args[26]})\`\n__Stamina cost__: ${args[13]<1 ? `${args[13]*100}%` : args[13]} \`(${args[27]})\`\n__Effect__: ${args[14]}\n__Special__: ${args[15]}\n__Specialvalue__: Small[${args[16]}], Medium[${args[17]}], Leviathan[${args[18]}] \`(+${args[28]}|+${args[29]}|+${args[30]})\`\n__Rounds__: ${args[19]} \`(+1 - requires ${args[31]} points)\`\n__EmojiID__: ${args[20]}\n__Description__: *${descargs[1]}*\n__Fightdescription__: **${descargs[2]}**`)
        })
    })
}

else if (cmd == "lootbox.add"){
    if(message.author.id != "180995521622573057") return errmsg("You are not authorized for this action!").catch(allerrors)
    else if(!args[0]) return errmsg(`Specify a lootbox name`)
    //adds second arguments for the items & chances
    let iandc = args.slice(3).join(" ").trim().split(/ +/g);
    console.log(iandc)
    let items = ``
    let chances = ``
    iandc.forEach((char) => {
        items = items + ` ` + char.slice(2, char.length)
        chances = chances + ` ` + parseFloat(char.slice(0, 2))
    })
    console.log(items)
    console.log(chances)
    //the item table
    sql.get(`SELECT * FROM lootboxes WHERE name = "${args[0]}"`).then((row) =>{
        if(!row){
            sql.run(`INSERT INTO lootboxes (name, ccost, color, items, chances) VALUES (?, ?, ?, ?, ?)`, args[0], args[1], args[2], items, chances)
            message.channel.send(`${botye} Created ${args[0]} lootbox!\nName: ${args[0]}\nCrystal cost: ${args[1]}\nCrystal cost: ${args[2]}\nItems: ${items}\nChances: ${chances}`)
        }
        else return message.channel.send(`${botno} ${args[0]}-lootbox already exists!`)
    }).catch(() =>{
        sql.run("CREATE TABLE IF NOT EXISTS lootboxes (name TEXT, ccost INTEGER, color TEXT, items TEXT, chances TEXT)").then(()=>{
            sql.run(`INSERT INTO lootboxes (name, ccost, color, items, chances) VALUES (?, ?, ?, ?, ?)`, args[0], args[1], args[2], items, chances)
            message.channel.send(`${botye} Created ${args[0]} lootbox!\nName: ${args[0]}\nCrystal cost: ${args[1]}\nCrystal cost: ${args[2]}\nItems: ${items}\nChances: ${chances}`)
        })
    })
}
else if (cmd == "lootboxes"){
    let rows = await sql.all(`SELECT * FROM lootboxes ORDER BY ccost`)
    rows.forEach((row) => {
        let itemsa = row.items.slice(0).trim().split(/ +/g);
        let chancesa = row.chances.slice(0).trim().split(/ +/g);
        let emb = new Discord.RichEmbed()
        .setTitle(`${row.name} crate`)
        .setDescription(`<:crystals:544216012342558730> ${row.ccost}\n\n__**Items in this crate:**__\n⁣`)
        .setColor(row.color)
        for(i=0; i<itemsa.length; i++){
            emb.addField(`${itemsa[i]}`, `${chancesa[i]}% chance\n⁣`)
        }
        message.channel.send(emb).catch(allerrors)
    })
}

else if (cmd == "effect.add"){
    if(message.author.id != "180995521622573057") return message.channel.send(botno + " You are not authorized for this action!").catch(allerrors)

    if(!args[0]) return errmsg("No name defined")
    if(!args[1]) return errmsg("No type defined")
    if(!args[2]) {args[2] = "None"}
    if(!args[3]) return errmsg("No description defined")
    if(!args[3]) return errmsg("No fight description defined")
    if(!args[4]) return errmsg("No apply description defined")
    sql.get(`SELECT * FROM effects WHERE name = "${args[0]}" COLLATE NOCASE`).then((row) =>{
        if(!row){
            sql.run(`INSERT INTO effects (name, type, dmgtype, desc, fightdesc, applydesc) VALUES (?, ?, ?, ?, ?, ?)`, args[0], args[1], args[2], args[3].replace(/#/g, " "), args[4].replace(/#/g, " "), args[5].replace(/#/g, " ")).catch(allerrors)
            message.channel.send(botye + `Added **${args[0]}**!\nType: ${args[1]}\nDamage type: ${args[2]}\n\nDescription: ${args[3].replace(/#/g, " ")}\n\nFightdescription: \`${args[4].replace(/#/g, " ")}\`\n\nApply description: \`${args[5].replace(/#/g, " ")}\`.`)
        }   
        else return message.channel.send(`${botno} Effect already exists!`)
    }).catch(() =>{
        sql.run(`CREATE TABLE IF NOT EXISTS effects (name TEXT, type TEXT, dmgtype TEXT, desc TEXT, fightdesc TEXT, applydesc TEXT)`).then(() => {
            sql.run(`INSERT INTO effects (name, type, dmgtype, desc, fightdesc, applydesc) VALUES (?, ?, ?, ?, ?, ?)`, args[0], args[1], args[2], args[3].replace(/#/g, " "), args[4].replace(/#/g, " "), args[5].replace(/#/g, " ")).catch(allerrors)
            message.channel.send(botye + `Added **${args[0]}**!\nType: ${args[1]}\nDamage type: ${args[2]}\n\nDescription: ${args[3].replace(/#/g, " ")}\n\nFightdescription: \`${args[4].replace(/#/g, " ")}\`\n\nApply description: \`${args[5].replace(/#/g, " ")}\`.`)
        })
    })
}

else if(cmd == "drop.add"){
    if(message.author.id != "180995521622573057") return message.channel.send(botno + " You are not authorized for this action!").catch(allerrors)
    //the drops table
    sql.get(`SELECT * FROM drops WHERE creature = "${args[0]}" AND name = "${args[1]}"`).then((row) =>{
        if(!row){
            sql.run(`INSERT INTO drops (creature, name, quantitymin, quantitymax, quality) VALUES (?, ?, ?, ?, ?)`, args[0], args[1], args[2], args[3], args[4])
            message.channel.send(`${botye} Created drop for ${args[0]}:\nName: ${args[1]}\nQuantity: ${args[2]}-${args[3]}\nQuality: ${args[4]}`)
        }
        else return message.channel.send(`${botno} Drop for this creature already exists!`)
    }).catch(() =>{
        sql.run("CREATE TABLE IF NOT EXISTS drops (creature TEXT, name TEXT, quantitymin INTEGER, quantitymax INTEGER, quality TEXT)").then(()=>{
            sql.run(`INSERT INTO drops (creature, name, quantitymin, quantitymax, quality) VALUES (?, ?, ?, ?, ?)`, args[0], args[1], args[2], args[3], args[4])
            message.channel.send(`${botye} Created drop for ${args[0]}:\nName: ${args[1]}\nQuantity: ${args[2]}-${args[3]}\nQuality: ${args[4]}`)
        })
    })
}
else if(cmd == "creature.add"){
    if(message.author.id != "180995521622573057") return message.channel.send(botno + " You are not authorized for this action!").catch(allerrors)
    else if(!args[0]) return errmsg(`You must assign the creature a species`)
    //creates the creatures table if it doesn't exist
    sql.run("CREATE TABLE IF NOT EXISTS creatures (species TEXT, health INTEGER, healthregen INTEGER, maxhealthinc INTEGER, shields INTEGER, maxshieldsinc INTEGER, attack INTEGER, maxattackinc INTEGER, stamina INTEGER, staminaregen INTEGER, maxstaminainc INTEGER, skin TEXT, chance INTEGER, tameable INTEGRER, maxfood INTEGER, maxfoodinc INTEGER, foodreq INTEGER, class TEXT, diet TEXT, pic TEXT, col TEXT, maxtorpidity INTEGER, torpidityloss INTEGER, maxtorpidityinc INTEGER, torpiditydmg INTEGER, tamereq INTEGER, tamefoodreq INTEGER, updated INTEGER, desc TEXT)")
    //ensures the creature doesn't exist yet
    let crrow = await sql.get(`SELECT * FROM creatures WHERE species = "${args[0].toLowerCase()}" COLLATE NOCASE`).catch(allerrors)
    if(!crrow){
        //add the row
        await sql.run(`INSERT INTO creatures (species, health, healthregen, maxhealthinc, shields, maxshieldsinc, attack, maxattackinc, stamina, staminaregen, maxstaminainc, skin, chance, tameable, maxfood, maxfoodinc, foodreq, class, diet, pic, col, maxtorpidity, torpidityloss, maxtorpidityinc, torpiditydmg, tamereq, tamefoodreq, updated, desc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, `Temp`).catch(allerrors)
        //select the row for column amount and names
        let row = await sql.get(`SELECT * FROM creatures WHERE species = "Temp"`).catch(allerrors)
        let columns = Object.keys(row)
        let msg = await message.channel.send(`Processing...`)
        // --- goes through each column and asks for input (skips the first one)
        //variable to determine which column to change
        let i = 1

        function waitforanswer(){
            msg.edit(`**${columns[i]}** ?`).catch(allerrors)
            //variable to store if the user reacted or the menu timed out
            let reacted = 0
            //creates a message collector to listen for the users answer for 30 seconds
            const collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 120000 });
            collector.on('collect', async message => {
                //gets the arguments on the new message
                let args2 = message.cleanContent.trim().split(/ +/g);

                reacted = 1
                await sql.run(`UPDATE creatures SET ${columns[i]} = ? WHERE species = "Temp"`, args2.join(" ")).catch(allerrors)
                collector.stop()
                message.delete().catch(allerrors)

            })
            collector.on('end', async e => {
                if(reacted == 0){
                    errmsg(`Exited creature creator.`)
                    sql.run(`DELETE FROM creatures WHERE species = "Temp"`).catch(allerrors)
                }
                else if(i+1 < columns.length){
                    i++
                    waitforanswer();
                }
                else{
                    sql.run(`UPDATE creatures SET species = ? WHERE species = "Temp"`, args[0]).catch(allerrors )
                    msg.edit(`${botye} Completed creature creation!\nAdded new species: \`${args[0]}\``)
                }
            })
        }
        waitforanswer()

    }
    else{errmsg(`This creature already exists`)}
}

else if (cmd == "testlevels"){
    let maxlevel = 15
    let temp = 0
    let chances = []
    let levels = []
    async function doit(){
        for(i=0; i<=maxlevel; i++){
        temp = temp + (maxlevel-i+1)
        }
    }
    total = 0
    await doit();
    for(x=0; x<=maxlevel; x++){
        console.log(`${x} probability: `+((maxlevel-x)+1)/temp)
        total=total+((maxlevel-x)+1)/temp
        chances.push(((maxlevel-x)+1)/temp)
        levels.push(x)
    }
    console.log(`Total is: ${total}`)
    console.log(chances)
    console.log(levels)
    console.log(`Randomly selected enemy is level: `+chanceobj.weighted(levels, chances))
    let justasec = []
    for(i=0;i<10000;i++){
        justasec.push(chanceobj.weighted(levels, chances))
    }
    let text = ""

    function count() {
        array_elements = justasec
    
        array_elements.sort(function(a, b){return a - b});
    
        var current = null;
        var cnt = 0;
        for (var i = 0; i < array_elements.length; i++) {
            if (array_elements[i] != current) {
                if (cnt > 0) {
                    text = text + current + ' --> ' + cnt + ' times\n'
                    console.log(current + ' --> ' + cnt + ' times');
                }
                current = array_elements[i];
                cnt = 1;
            } else {
                cnt++;
            }
        }
        if (cnt > 0) {
            text = text + current + ' --> ' + cnt + ' times\n'
           console.log(current + ' --> ' + cnt + ' times');
        }
    
    }
    await count();
    message.channel.send(text)

}

else if(cmd=="eval"){
    if (message.author.id != "180995521622573057") return
    function clean(text) {
        if (typeof(text) === "string")
          return text.replace(/`/g, "`" + String.fromCharCode(8203)).replace(/@/g, "@" + String.fromCharCode(8203));
        else
            return text;
      }
    try {
        const code = args.join(" ");
        let evaled = eval(code);
   
        if (typeof evaled !== "string")
            evaled = require("util").inspect(evaled);
   
            message.channel.send(clean(evaled), {code:"xl"});
    } catch (err) {
        message.channel.send(`\`ERROR\` \`\`\`xl\n${clean(err)}\n\`\`\``);
    }
}
else if(cmd == "doit"){
    let ary = allcmds.sort()
    let a = ``
    for(i=0; i<ary.length; i++){
        a += `• ${ary[i]}\n`
    }
    message.channel.send(`Commands:\n\n`+a)
}
//#endregion
});


//function for removing food, happiness & torpor, adding health & stamina to pets & advancing the ongoing tames
async function regulars(){
    //gets all pet rows from pets that aren't in battle
    let petrows = await sql.all(`SELECT * FROM pets WHERE inbattle = "0"`).catch(allerrors)
    //updates the stats for every pet
    if(petrows != "" && petrows != undefined){
        petrows.forEach(async(row) => {
            //gets the species row for the current pet
            let crrow = await sql.get(`SELECT * FROM creatures WHERE species = "${row.species}"`)
            //if the species row isn't found, return
            if(!crrow || crrow == undefined) return
            // --- regeneration & losses per hour
            let stamperh = 60
            let healthperh = 10
            let torpperh = crrow.torpidityloss
            let happyperh = row.maxhappiness/50
            let foodperh = crrow.foodreq

            // --- dates
            let nowdate = new Date(getcurdate()*1000) //current date    
            let stamdate = new Date(row.stamtime*1000) //date when the stamina was last updated
            let healthdate = new Date(row.healthtime*1000) //date when the health was last updated
            let torpdate = new Date(row.torpiditytime*1000) //date when the torpidity was last updated
            let happydate = new Date(row.happinesstime*1000) //date when happiness was last updated
            let fooddate = new Date(row.foodtime*1000) //date when the food was last updated

            // --- stamina
            let stamdiff = moment(nowdate).diff(moment(stamdate), `seconds`) //the time difference in seconds since the stamina was last updated
            let secsperstamina = 3600/stamperh //stores how many seconds it takes to regenerate 1 stamina

            // --- health
            let healthdiff = moment(nowdate).diff(moment(healthdate), `seconds`) //the time difference in seconds since the health was last updated
            let secsperhealth = 3600/healthperh //stores how many seconds it takes to regenerate 1 health

            // --- torpor
            let torpdiff = moment(nowdate).diff(moment(torpdate), `seconds`) //the time difference in seconds since the torpidity was last updated
            let secspertorp = 3600/torpperh //stores how many seconds it takes to remove 1 torpidity

            // --- happiness
            let happydiff = moment(nowdate).diff(moment(happydate), `seconds`) //the time difference in seconds since the happiness was last updated
            let secsperhappy = 3600/happyperh //stores how many seconds it takes to remove 1 happiness

            // --- food
            let fooddiff = moment(nowdate).diff(moment(fooddate), `seconds`) //the time difference in seconds since the food was last updated
            let secsperfood = 3600/foodperh //stores how many seconds it takes to remove 1 food
            
            // --- checks which stats can be updated
            if(stamdiff >= secsperstamina){//if the stamina can be updated, add it.
                let addstam = Math.floor(stamdiff/secsperstamina)+row.stamina > row.maxstamina ? row.maxstamina-row.stamina : Math.floor(stamdiff/secsperstamina) //calculates how much stamina to add, doesn't add more than required to fill it to max
                //ensures the pet doesn't regenerate stamina while starving
                if(row.food<=0){addstam = 0}
                //adds the stamina and resets the stamina timer
                sql.run(`UPDATE pets SET stamina = "${addstam+row.stamina}", stamtime = "${getcurdate()}" WHERE owner = "${row.owner}" AND name = "${row.name}"`).catch(allerrors)
            }

            if(healthdiff >= secsperhealth){//if the health can be updated, add it.
                let addhealth = Math.floor(healthdiff/secsperhealth)+row.health > row.maxhealth ? row.maxhealth : Math.floor(healthdiff/secsperhealth) //calculates how much health to add, doesn't add more than required to fill it to max
                //ensures the pet doesn't regenerate health while starving
                if(row.food<=0){addhealth = 0}
                //adds the health and resets the health timer
                sql.run(`UPDATE pets SET health = "${addhealth+row.health}", healthtime = "${getcurdate()}" WHERE owner = "${row.owner}" AND name = "${row.name}"`).catch(allerrors)
            }

            if(torpdiff >= secspertorp){//if the torpidity can be updated, remove it.
                let removetorp = row.torpidity-Math.floor(torpdiff/secspertorp) < 0 ? 0 : Math.floor(torpdiff/secspertorp) //calculates how much torpor to remove, doesn't remove more than required to drop to 0
                //ensures the pet doesn't lose torpidity while starving
                if(row.food<=0){removetorp = 0}
                //variable for waking up the pet if it's torpidity is 0 again
                let wakeup = row.torpidity-removetorp == 0 ? `ko = "0", ` : ``
                //removes the torpidity and resets the torpidity timer
                sql.run(`UPDATE pets SET torpidity = "${row.torpidity-removetorp}", ${wakeup}torpiditytime = "${getcurdate()}" WHERE owner = "${row.owner}" AND name = "${row.name}"`).catch(allerrors)
            }

            if(happydiff >= secsperhappy){//if the happiness can be updated, remove it.
                let removehappy = row.happiness-Math.floor(happydiff/secsperhappy) < 0 ? 0 : Math.floor(happydiff/secsperhappy) //calculates how much happiness to remove, doesn't remove more than required to drop to 0
                //removes the happiness and resets the happiness timer
                sql.run(`UPDATE pets SET happiness = "${row.happiness-removehappy}", happinesstime = "${getcurdate()}" WHERE owner = "${row.owner}" AND name = "${row.name}"`).catch(allerrors)
            }

            if(fooddiff >= secsperfood){//if the food can be updated, remove it.
                let removefood = row.food-Math.floor(fooddiff/secsperfood) < 0 ? 0 : Math.floor(fooddiff/secsperfood) //calculates how much food to remove, doesn't remove more than required to drop to 0
                if(row.food == 0){//if the pet is out of food, damage it for the amount of food that WOULD be removed
                    //damages (or kills) the pet
                    applydamage(row.name, row.owner, Math.floor(fooddiff/secsperfood), `of starvation`, 1)
                }
                else{//otherwise just remove the food
                    //removes the food and resets the food timer
                    sql.run(`UPDATE pets SET food = "${row.food-removefood}", foodtime = "${getcurdate()}" WHERE owner = "${row.owner}" AND name = "${row.name}"`).catch(allerrors)
                }
            }
        })
    }

    //gets all rows of ongoing tames from the database
    let tamerows = await sql.all(`SELECT * FROM tames`).catch(allerrors)
    if(tamerows != "" && tamerows != undefined){
        tamerows.forEach(async(row) => {
            //gets the species row for the current tame
            let crrow = await sql.get(`SELECT * FROM creatures WHERE species = "${row.species}"`).catch(allerrors)
            if(!crrow) return //if the species row isn't found, return
            //gets the foodrow for taming stats
            let foodrow = await sql.get(`SELECT * FROM items WHERE category = "Food" AND name = "${row.foodtype}"`).catch(allerrors)
            if(!foodrow) return //if the food item used for taming isn't found, return
            // --- losses per hour
            let torpperh = crrow.torpidityloss
            let foodperh = crrow.tamefoodreq

            // --- dates
            let nowdate = new Date(getcurdate()*1000) //current date    
            let torpdate = new Date(row.torptime*1000) //date when the torpidity was last updated
            let fooddate = new Date(row.foodtime*1000) //date when the food was last updated

            // --- torpor
            let torpdiff = moment(nowdate).diff(moment(torpdate), `seconds`) //the time difference in seconds since the torpidity was last updated
            let secspertorp = 3600/torpperh //stores how many seconds it takes to remove 1 torpidity

            // --- food
            let fooddiff = moment(nowdate).diff(moment(fooddate), `seconds`) //the time difference in seconds since the food was last updated
            let secsperfood = 3600/foodperh //stores how many seconds it takes to remove 1 food
            
            // --- checks which stats can be updated
            if(torpdiff >= secspertorp){//if the torpor can be updated, remove it.
                let removetorp = row.torpor - Math.floor(torpdiff/secspertorp) < 0 ? 0 : Math.floor(torpdiff/secspertorp) //calculates how much torpor to remove, doesn't remove more than to 0
                
                if(row.torp-removetorp <= 0){//if the tame wakes up, delete it from the row
                    //removes the tamerow from the database
                    sql.run(`DELETE FROM tames WHERE species = "${row.species}" AND userId = "${row.userId}" AND time = "${row.time}"`).catch(allerrors)
                    //sends the user a notification
                    newnotif(`**${row.name}** (lvl. ${row.lvl} ${row.species}) woke up! Taming unsuccessful.`, row.userId)
                }
                else{
                    //removes the torpor and resets the torpor timer
                    sql.run(`UPDATE tames SET torp = "${row.torp-removetorp}", torptime = "${getcurdate()}" WHERE userId = "${row.userId}" AND species = "${row.species}"`).catch(allerrors)
                }
                
            }
            if(fooddiff >= secsperfood){//if the food can be updated, remove it.
                let removefood = row.food - Math.floor(fooddiff/secsperfood) < 0 ? 0 : Math.floor(fooddiff/secsperfood) //calculates how much food to remove, doesn't remove more than to 0
                
                if(row.food+foodrow.saturation<=row.maxfood){//tame can eat something
                    //gets the item row of the user's food item
                    let itemrow = await sql.get(`SELECT * FROM useritems WHERE category = "Food" AND name = "${foodrow.name}" AND owner = "${row.userId}"`).catch(allerrors)
                    //if the user doesn't have any more items to tame it with, just remove the food
                    if(!itemrow) return sql.run(`UPDATE pets SET food = "${row.food-removefood}", foodtime = "${getcurdate()}" WHERE owner = "${row.owner}" AND name = "${row.name}"`).catch(allerrors)

                    if(itemrow.amount < 2){//if the user only has one item left, delete the item row
                        await sql.run(`DELETE FROM useritems WHERE category = "Food" AND name = "${foodrow.name}" AND owner = "${row.userId}"`).catch(allerrors)
                    }
                    else{//otherwise, remove 1 from the amount
                        await sql.run(`UPDATE useritems SET amount = "${itemrow.amount-1}" WHERE category = "Food" AND name = "${foodrow.name}" AND owner = "${row.userId}"`).catch(allerrors)
                    }
                    
                    //adds the saturation amount of the selected food item to the tame's food stat and advances the taming progress by an amount specified by the item (or to the maximum if it would exceed it) 
                    sql.run(`UPDATE tames SET food = "${row.food+foodrow.saturation}", foodtime = "${getcurdate()}", tameprog = "${row.tameprog+itemrow.effectval>row.tamereq?row.tamereq:row.tameprog+itemrow.effectval}" WHERE userId = "${row.userId}" AND time = "${row.time}" AND species = "${row.species}"`).catch(allerrors)

                    // --- taming successful
                    if(row.tameprog+itemrow.effectval >= row.tamereq){
                        let urow = await sql.get(`SELECT * FROM users WHERE userId = "${row.userId}"`)
                        //adds the new pet to the pet table
                        sql.run(`INSERT INTO pets (species, name, owner, health, maxhealth, healthtime, shields, attack, stamina, maxstamina, happiness, maxhappiness, happinesstime, torpidity, maxtorpidity, torpiditytime, torpiditydmg, skin, chance, pic, xp, lvl, stamtime, passive, passiveval, food, maxfood, foodtime, class, ko, points, inbattle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, row.species, row.name, row.userId, row.health, row.maxhealth, getcurdate(), row.shields, row.attack, row.stamina, row.maxstamina, 100, 100, getcurdate(), 0, row.maxtorp, getcurdate(), crrow.torpiditydmg, 0, crrow.chance, crrow.pic, row.xp, row.lvl, getcurdate(), "None", 1, row.maxfood, row.maxfood, getcurdate(), crrow.class, 0, 0, 0)
                        //removes the tamerow from the database
                        sql.run(`DELETE FROM tames WHERE userId = "${row.userId}" AND time = "${row.time}" AND species = "${row.species}"`)
                        //updates the user's row with the new pet amount
                        await sql.run(`UPDATE users SET pets = "${urow.pets+1}" WHERE userId = "${row.userId}"`).catch(allerrors)
                        //sends the user a notification
                        newnotif(`**${row.name}** (lvl. ${row.lvl} ${row.species}) was tamed! Taming successful.`, row.userId)
                    }
                }
                else{
                    //removes the food and resets the food timer
                    sql.run(`UPDATE tames SET food = "${row.food-removefood}", foodtime = "${getcurdate()}" WHERE userId = "${row.userId}" AND name = "${row.name}" AND time = "${row.time}"`).catch(allerrors)
                }
            }
        })
    }

    //gets all rows of userítems that have a decay
    let itemrows = await sql.all(`SELECT * FROM useritems WHERE decaytime > "0"`).catch(allerrors)
    if(itemrows != "" && itemrows != undefined){
        itemrows.forEach(async(row) => {
            //create dates to compare for decay time
            let nowdate = new Date()
            let decaydate = new Date((row.decaytime+row.time)*1000)
            let secs =  moment(decaydate).diff(nowdate, `seconds`)
            console.log(secs)
            if(secs <= 0){//if the item decayed, emove 1
                if(row.amount < 2){//user only has 1 item left
                    //delete the row
                    sql.run(`DELETE FROM useritems WHERE owner = "${row.owner}" AND name = "${row.name}"`).catch(allerrors)
                    //notify the user
                    newnotif(`All of your ${row.name.toLowerCase()} decayed!`, row.owner)
                }
                else{//otherwise remove 1 item and reset time
                    sql.run(`UPDATE useritems SET amount = "${row.amount-1}", time = "${getcurdate()}" WHERE owner = "${row.owner}" AND name = "${row.name}"`).catch(allerrors)
                }
            }
        })
    }
}
//runs the regulars function every 10 seconds
let doregulars = setInterval(function(){regulars()}, 10000)

//this will run the code with our bot
bot.login(config.token2)