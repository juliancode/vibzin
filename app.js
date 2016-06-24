var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongoose = require("mongoose"),
	Promise = require("bluebird"),
	Video = require('./js/db').Video,
	User = require('./js/db').User,
	people = {},
	users = [],
	// cue = [],
	fired = false,
	port = Number(process.env.PORT || 3000);

function getUserNames(users) {
  var userNames = users.map(function(user) {
    if (user.name)
      return user.name
    throw Error("User does not have property name" + JSON.stringify(user))
  })

  return userNames
}

server.listen(port, function() {
	console.log("now listening on: " + port);
});

app.get('/', function(req, res){
	res.sendFile(__dirname + '/index1.html');
});

app.use(express.static('public'));

io.on('connection', function(socket) {
	console.log("Connection")
	getCueFromDb()
	.then(function(cue) {
		io.sockets.emit('send cue', cue);
	})
	.catch(function(err) {
		console.log("Error", err)
	})

	socket.on('new user', function(data, callback) {
		console.log("New user")
		return getUsersFromDb()
		.then(function() {
     	var userNames = getUserNames(users)

			if (userNames.indexOf(data.nick) > -1) {
				callback(false); // Username exists
			}
			else {
				callback(true);
				socket.nickname = data.nick;
				people[socket.nickname] = socket;
				updateNicknames();
				var user = new User();
				user.name = data.nick;
				user.flag = data.flag;
				// console.log(data.nick)
				// console.log(data.flag)
				// console.log(user.name)
				// console.log(user.country)
				user.save(function(err, data) {
					if (err) {
						console.log(err)
					}
					else {
						getUsersFromDb()
						.then(function() {
							updateNicknames()
						})
						.catch(function(e) {
							console.log("Error", e, e.stack)
						})
					}
				});
				socket.broadcast.emit('user join', {nick: socket.nickname});
			}
		})
		.catch(function(e) {
			console.log("Error", e, e.stack)
		})
	});

	socket.on('disconnect', function(data) {
		if (!socket.nickname) {
			console.log("No socket nickname")
			return
		}
		else {
			return removeUser(socket.nickname)
			.then(function() {
        		var userNames = getUserNames(users)
				var index = userNames.indexOf(socket.nickname)
				if (index > -1) {
					users.splice(index, 1);
				}
				delete people[socket.nickname];

				return getUsersFromDb()
				.then(function() {
					updateNicknames()
					socket.broadcast.emit('user leave', {nick: socket.nickname});
				})
			})
			.catch(function(e) {
				console.log("Error", e, e.stack)
			})
		}
	});

	socket.on('vote skip', function(data) {
		console.log("Vote skip")
		if (data.skipvotes >= Math.round(Object.keys(people).length)/2) {
			io.sockets.emit('skip', {skip: true, skipvotes: data.skipvotes, username: socket.nickname})
		} else {
			io.sockets.emit('skip', {skip: false, skipvotes: data.skipvotes, username: socket.nickname})
		}
	});

	socket.on('new video', function(data) {
		console.log("New video")

		return addToCue(data.id, data.title, socket.nickname)
		.then(function() {
			return getCueFromDb()
		})
		.then(function(cue) {
			io.sockets.emit('send cue', cue);
		})
		.then(function() {
			console.log("Emit change video")
			io.sockets.emit('change video', {id: data.id, title: data.title, nick: socket.nickname});
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});

	socket.on('play next video', function() {
		console.log("Play next video")
		// when TRUE do nothing
		if (fired) 
			return
		fired = true;
		setTimeout(function() {
			fired = false;
		}, 3000);

		getCueFromDb()
		// if cue.length is TRUE removeVideo else if FALSE return cue
		.then(function(cue) { 
			return cue.length ? removeVideo(cue[0].id) : cue 
		})
		.then(function(cue) {
			return getCueFromDb()
		})
		.then(function(cue) {
			io.sockets.emit('send cue', cue);
			return cue
		})
		.then(function(cue) { 
			io.sockets.emit('next video');
			return cue 
		})
		.then(console.log)
		.catch(function(e) {
			console.log("Error")
		})
	})

	socket.on('send message', function(data, callback) {
		var msg = data.trim();
		io.sockets.emit('new message', {msg: msg, nick: socket.nickname});
	});

	socket.on('pause video', function(data) {
		io.sockets.emit('pause video');
	});

	socket.on('play video', function(data) {
		io.sockets.emit('play video');
	});

	socket.on('good vibe', function(data) {
		console.log(data)
		return changeVibe('good', data)
		.then(function() {
			return getUsersFromDb()
		})
		.then(function() {
			return updateNicknames();
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});

	socket.on('bad vibe', function(data) {
		return changeVibe('bad', data)
		.then(function() {
			return getUsersFromDb()
		})
		.then(function() {
			updateNicknames();
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});
});

// function updateNicknames(){
// 	io.sockets.emit('usernames', Object.keys(people));
// }

function updateNicknames(){
	console.log("Update nicknames")
  var names = getUserNames(users)
  var vibes = users.map(function(user) { return user.vibes })
  var flag = users.map(function(user) { return user.flag })

	io.sockets.emit('usernames', {vibzer: names, numberofvibes: vibes, flag: flag});
}


var emptyCue = function() {
	cue = [];
}

var emptyUser = function() {
	users = [];
}

var getUsersFromDb = function() {
	console.log("getUsersFromDb")
	return new Promise(function(resolve, reject) {
		User.find({}).exec(function(err, vibzers) {
			if (err) {
				console.log(err);
				reject(err);
			}
			if (vibzers.length) {
				emptyUser();
				vibzers.forEach(function(vibzer) {
          			users.push(vibzer)
					if (users.length === vibzers.length) {
						resolve();
					}
				});
			} else {
				resolve()
			}
		});
	});
}

var removeUser = function(nick) {
	return new Promise(function(resolve, reject) {
		User.find({'name' : nick}).remove(function(err, data) {
			if (err)
				reject(err);
			else {
				console.log("Remove user")
				resolve();
			}
		});
	})
}

// var getCueFromDb = function() {
// 	return new Promise(function(resolve, reject) {
// 		Video.find({}).exec(function(err, videos) {
// 			console.log(videos)
// 			if (err) {
// 				reject(err);
// 			}
// 			if (videos.length) {
// 				emptyCue();
// 				videos.forEach(function(video) {
// 					cue.push(video)
// 					if (videos.length === cue.length) {
// 						io.sockets.emit('send cue', cue);
// 						resolve();
// 					}
// 				});
// 			} else {
// 				emptyCue();
// 				io.sockets.emit('send cue', cue);
// 				resolve();
// 			}
// 		})
// 	})
// }

var getCueFromDb = function() {
	console.log("getCueFromDb")
	return new Promise(function(resolve, reject) {
		Video.find({}).exec(function(err, videos) {
			console.log(videos)
			if (err) {
				reject(err);
			} else {
				// io.sockets.emit('send cue', videos); NEED TO DO THIS ELSEWHERE
				resolve(videos);
			}
		})
	})
}



var removeVideo = function(id) {
	console.log("Remove video")
	return new Promise(function(resolve, reject) {
		Video.find({'id' : id}).remove(function(err, data) {
			if (err)
				reject(err);
			else {
				console.log("Remove video resolve")
				resolve();
			}
		});
	})
}

var addToCue = function(id, title, nick) {
	console.log("Add to cue")
	return new Promise(function(resolve, reject) {
		var video = new Video();
		console.log(title)
		video.id = id;
		video.title = title;
		video.user.name = nick;
		video.save(function(err, data) {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	})
}

var changeVibe = function(vibe, nick) {
	if (vibe === "good") {
		console.log("Good vibe")
		return new Promise(function(resolve, reject) {
			User.findOneAndUpdate({ 'name': nick}, { $inc: { vibes: 1 } }, { new: true }, function(err, doc) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}
	if (vibe === "bad") {
		console.log("Good vibe")
		return new Promise(function(resolve, reject) {
			User.findOneAndUpdate({ 'name': nick}, { $inc: { vibes: -1 } }, { new: true }, function(err, doc) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}
}
