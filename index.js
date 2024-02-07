const { Client, Collection, BaseGuildVoiceChannel } = require("discord.js-selfbot-v13");
const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource, AudioPlayerStatus, getMainPlayer } = require("@discordjs/voice");
const keepAlive = require("./server.js");
const play = require('play-dl');
var request = require('request');
//require('dotenv').config()


const prefix = "!";

const client = new Client({
  checkUpdate: false,
});

client.queue = []
client.nowPlaying = null;
client.isPlaying = false;
client.isPaused = false;
client.loop = false;
client.player = null;


let client_id = process.env.CLIENT_ID
let client_secret = process.env.CLIENT_SECRET

function get_token(obj) {
    let url = "https://accounts.spotify.com/api/token"
    let headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    request({
      url: url,
      method: "POST",
      headers: headers,
      body: `grant_type=client_credentials&client_id=${client_id}&client_secret=${client_secret}`
  }, function (error, response, body){
    obj.token = JSON.parse(response.body)["access_token"];
  });
}

function song(s, id) {
    let obj = {token: null};
    get_token(obj);
    setInterval(function(){
      if(obj.token != null) {
        clearInterval(this);
        request({
          url: `https://api.spotify.com/v1/tracks/${id}`,
          method: "GET",
          headers: {"Authorization": "Bearer "+obj.token}
      }, function (error, response, body){
        s.song = JSON.parse(response.body)["name"] + " by ";
        for(let i = 0; i < JSON.parse(response.body)["artists"].length; i++) {
            s.song += JSON.parse(response.body)["artists"][i]["name"] + ", "
        }
        s.song = s.song.slice(0, s.song.length - 2)
      });
      }
    }, 100);
}


function playlist(s, id) {
  let obj = {token: null};
  get_token(obj);
  setInterval(function(){
    if(obj.token != null) {
      clearInterval(this);
      request({
        url: `https://api.spotify.com/v1/playlists/${id}`,
        method: "GET",
        headers: {"Authorization": "Bearer "+obj.token}
    }, function (error, response, body){
      s.list = [];
      s.name = JSON.parse(body)["name"];
      for (var i = 0; i < JSON.parse(body)["tracks"]["items"].length; i++) {
        let str = JSON.parse(body)["tracks"]["items"][i]["track"]["name"] + " by ";
        for (var j = 0; j < JSON.parse(body)["tracks"]["items"][i]["track"]["artists"].length; j++) {
          str += JSON.parse(body)["tracks"]["items"][i]["track"]["artists"][j]["name"] + ", ";
        }
        str = str.slice(0, str.length - 2);
        s.list.push(str);
      }
    });
    }
  }, 100);
}

client.on("ready", async () => {
  console.log(client.user.tag + " is ready!");
});


async function plays(message) {
  if(client.queue.length > 0) {
    client.isPlaying = true;
    let connection = getVoiceConnection(message.guild.id);
    let song = client.queue[0];
    if(client.loop) {
      client.queue.push(song);
    }
    let url = song["url"];
    client.queue.shift();
    let info = await play.video_info(url)
    client.nowPlaying = song;
    const source =  (await play.stream(url));
    const resource = createAudioResource(source.stream, {
      inputType : source.type
 })
    if(!client.player) {
      client.player = createAudioPlayer();
    }
    let player = client.player;
    connection.subscribe(player);
    player.play(resource);
    player.on(AudioPlayerStatus.Idle, async () => {
      await plays(message);
    })
    player.on("error", (e) => {
      console.log(e);
    })
  } else {
    client.isPlaying = false;
    client.nowPlaying = null;
    setTimeout(() => {
      if(client.queue.length === 0 && client.nowPlaying == null) {
        let connection = getVoiceConnection(message.guild.id);
        if(connection) {
          connection.destroy();
        }
      }
    }, 30000);
  }
}

client.on("messageCreate", async (message) => {
  if(message.author.id === client.user.id) return;
  if(!message.content.startsWith(prefix)) return;
  const args = message.content.split(" ");
  try{
  switch(args[0].replace(prefix, "")) {
    case "play":
    case "p":
    case "pl":
      if(!message.member.voice.channel) {
        message.channel.send("Bạn phải ở trong voice để thực hiện lệnh này!");
      } else {
        if(!(args.length > 1)) {
          message.channel.send("Bạn phải cung cấp link hoặc tên bài hát để phát nhạc!");
          return;
        }
        let name = args.slice(1).join(" ");
        if(!message.guild.me.voice.channel) {
        joinVoiceChannel({
          channelId: message.member.voice.channel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
          selfDeaf: true,
          selfMute: false,
        })
        }
        message.channel.send(`Đang tìm bài hát...`)
        if(name.startsWith("https://www.youtube.com/watch") || name.startsWith("https://youtube.com/watch") || name.startsWith("https://youtu.be")) {
          try {
            let info = await play.video_info(name);
            client.queue.push({"url": info.video_details.url, "title": info.video_details.title});
            let song = info.video_details;
            message.channel.send(`Đã thêm bài **[${song.title}](${song.url})** vào list nhạc.`)
            if(!client.isPlaying && !client.isPaused) {
              await plays(message);
            }
          } catch (e) {
            message.channel.send(`Không tìm thấy bài hát.`)
          }
        } else if(name.startsWith("https://www.youtube.com/playlist") || name.startsWith("https://youtube.com/playlist")) {
          try {
          const playlist = await play.playlist_info(name, { incomplete : true })
          for (let i = 0; i < playlist.videos.length; i++) {
            client.queue.push({"url": playlist.videos[i].url, "title": playlist.videos[i].title});
          }
          message.channel.send(`Đã thêm playlist **[${playlist.title}](${playlist.url})** vào list nhạc.`)
          if(!client.isPlaying && !client.isPaused) {
            await plays(message);
          }
        } catch (e) {
          message.channel.send(`Không tìm thấy playlist.`)
        }
        } else if(name.startsWith("https://open.spotify.com/track/")) {
          try {
            let id = name.replace("https://open.spotify.com/track/", "")
            let obj = {song: null}
            song(obj, id)
            let inter = setInterval(async () => {
              if(obj.song != null) {
                clearInterval(inter);
                let sname = obj.song;
                const search = await play.search(sname, {  source : { youtube : "video" } });
                if(search.length == 0) {
                  message.channel.send(`Không tìm thấy bài hát.`)
                } else {
                  let song = search[0];
                  client.queue.push({"url": song.url, "title": song.title});
                  message.channel.send(`Đã thêm bài **[${song.title}](${song.url})** vào list nhạc.`)
                  if(!client.isPlaying && !client.isPaused) {
                    await plays(message);
                  }
                }
              }
            }, 100);
          } catch(e) {
            message.channel.send(`Không tìm thấy bài hát.`)
          }
          } else if(name.startsWith("https://open.spotify.com/playlist/")) {
            try {
              let id = name.replace("https://open.spotify.com/playlist/", "")
              let obj = {list: null, name: null}
              playlist(obj, id)
              let inter = setInterval(async () => {
                if(obj.name != null) {
                  clearInterval(inter);
                  for(let i = 0; i < obj.list.length; i++) {
                    let sname = obj.list[i];
                    const search = await play.search(sname, {  source : { youtube : "video" } });
                    let song = search[0];
                    client.queue.push({"url": song.url, "title": song.title});
                  }
                  message.channel.send(`Đã thêm playlist **[${obj.name}](${name})** vào list nhạc.`)
                  if(!client.isPlaying && !client.isPaused) {
                    await plays(message);
                  }
                }
              }, 100);
            } catch(e) {
              message.channel.send(`Không tìm thấy playlist.`)
            }
          } else {
          const search = await play.search(name, {  source : { youtube : "video" } });
          if(search.length == 0) {
            message.channel.send(`Không tìm thấy bài hát.`)
          } else {
            let song = search[0];
            client.queue.push({"url": song.url, "title": song.title});
            message.channel.send(`Đã thêm bài **[${song.title}](${song.url})** vào list nhạc.`)
            if(!client.isPlaying && !client.isPaused) {
              await plays(message);
            }
          }
        }
      }
      break;
    case "clear":
      client.queue = []
      message.channel.send(`Đã xóa toàn bộ list nhạc.`)
      break;
    case "queue":
    case "q":
      if(client.queue.length === 0) {
        message.channel.send(`Không có bài hát trong queue.`)
      } else {
        let songs = "";
        if(args.length > 1) {
          try {
            let count = parseInt(args[1]);
            if(count < 1) throw new Error();
              for(var i = (count - 1)*10+0; i < client.queue.length; i++) {
                songs += `#${i+1} - **${client.queue[i]["title"]}**\n`
                if(i >= (count - 1)*10+9) {
                  break;
                }
            }
          } catch (e) {
            message.channel.send(`Vui lòng nhập đúng số trang.`);
            return;
          }
        } else {
        for(var i = 0; i < client.queue.length; i++) {
          songs += `#${i+1} - **${client.queue[i]["title"]}**\n`
          if(i >= 9) {
            break;
          }
        }
        }
        message.channel.send(`Danh sách nhạc trong queue:\n${songs}`);
      }
      break;
    case "skip":
      if(client.player != null && client.nowPlaying != null) {
        if(args.length > 1) {
          try {
            let count = parseInt(args[1]);
            if(client.loop) {
              for (let i = 0; i < count; i++) {
                let song = client.queue[0];
                client.queue.shift();
                client.queue.push(song);
              }
            } else {
              for (let i = 0; i < count; i++) {
                if(client.queue.length > 0) {
                  client.queue.shift();
                }
              }
            }
          } catch (e) {
            message.channel.send(`Vui lòng nhập số bài muốn skip.`);
            return;
          }
        }
        client.player.stop();
        message.channel.send(`Đã skip bài hát hiện tại.`);
      } else {
        message.channel.send(`Hiện tại đang không phát nhạc.`);
      }
      break;
    case "stop":
      if(client.player != null) {
        client.queue = [];
        client.player.stop();
        message.channel.send(`Đã ngừng phát nhạc.`);
      }
      break;
    case "remove":
      if(client.queue.length > 0) {
        client.queue.pop();
        message.channel.send(`Đã xóa bài hát cuối cùng trong queue.`);
      } else {
        message.channel.send(`Không có bài hát trong queue.`);
      }
      break;
    case "pause":
      if(client.player != null) {
        if(client.isPlaying) {
          client.player.pause();
          client.isPlaying = false;
          client.isPaused = true;
          message.channel.send(`Đã tạm dừng phát nhạc.`);
        } else {
          message.channel.send(`Hiện tại đang không phát nhạc.`);
        }
      }
      break;
    case "resume":
      if(client.player != null) {
        if(client.isPaused) {
          client.player.unpause();
          client.isPlaying = true;
          client.isPaused = false;
          message.channel.send(`Đã tiếp tục phát nhạc.`);
        } else {
          message.channel.send(`Hiện tại không bị dừng phát nhạc.`);
        }
      }
      break;
    case "join":
    case "j":
      if(!message.member.voice) {
        message.channel.send("Bạn phải ở trong voice để thực hiện lệnh này!");
      } else {
        joinVoiceChannel({
          channelId: message.member.voice.channel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
          selfDeaf: true,
          selfMute: false,
        })
        message.channel.send("Đã tham gia voice.");
      }
      break;
    case "leave":
    case "l":
      if(!message.guild.me.voice.channel) {
        message.channel.send("Tôi đang không ở trong voice");
      } else {
        const connection = getVoiceConnection(message.guild.id);
        if(connection != null) {
          connection.destroy();
        }
        message.channel.send("Đã rời voice.");
      }
      break;
    case "now":
      if(client.nowPlaying != null) {
        message.channel.send(`Đang phát **[${client.nowPlaying["title"]}](${client.nowPlaying["url"]})**`);
      } else {
        message.channel.send("Không có bài hát nào đang được phát.");
      }
      break;
    case "loop":
      if(!client.loop) {
        client.loop = true;
        message.channel.send(`Bắt đầu lặp list nhạc.`);
      } else {
        client.loop = false;
        message.channel.send("Ngưng lặp list nhạc.");
      }
      break;
    case "help":
      message.channel.send(`Danh sách lệnh của bot: \n> **${prefix}play** *link hoặc tên bài hát*: phát nhạc theo tên hoặc link\n> **${prefix}loop**: bật hoặc tắt lặp playlist\n> **${prefix}skip** (*số bài hát*): skip bài hát đang phát và trong playlist\n> **${prefix}queue**: xem playlist bài hát\n> **${prefix}remove**: xóa bài hát vừa thêm vào\n> **${prefix}pause**: tạm dừng phát nhạc\n> **${prefix}resume**: tiếp tục phát nhạc\n> **${prefix}stop**: kết thúc phát nhạc\n> **${prefix}now**: xem bài hát đang được phát\n> **${prefix}clear**: xóa toàn bộ list nhạc\n> **${prefix}join**: yêu cầu bot tham gia voice\n> **${prefix}leave**: yêu cầu bot thoát voice`);
      break;
  }
  } catch(e) {
    console.log(e);
  }
});

client.login(process.env.TOKEN);

keepAlive();
