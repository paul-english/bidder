// -- includes
var express = require('express'),
 app = module.exports = express.createServer(),
 io = require('socket.io'),
 fs = require('fs'),
 jade = require('jade'),
 cradle = require('cradle'),
 connection = new(cradle.Connection)('127.0.0.1', 5984, {
   cache: true,
   raw: false
 }),
 db = connection.database('bidder'),
 auth = require('connect-auth'),
 OAuth = require('oauth').OAuth, 
 connect = require('connect'),
 keys= require('./keys_file'),
 redis = require('redis').createClient(6379, '127.0.0.1'),
 redisStore = require('connect-redis'),
 socket = io.listen(app);

// -- app settings
app.use(connect.cookieParser());
app.use(connect.session({ store: new redisStore({ maxAge: 600000, host: '127.0.0.1' }),
secret: 'superSecretstuffhere' })); 
app.use(express.static(__dirname + '/public'));
app.use(express.bodyParser());
app.use(auth([
  auth.Twitter({consumerKey: keys.twitterConsumerKey, consumerSecret: keys.twitterConsumerSecret}),
  auth.Facebook({appId : keys.fbId, appSecret: keys.fbSecret, scope: "email", callback: keys.fbCallbackAddress}),
  auth.Github({appId : keys.ghId, appSecret: keys.ghSecret, callback: keys.ghCallbackAddress}),
]));

// --
app.dynamicHelpers({
    authenticated: function(req, res) {
        return user.isAuthenticated
    },
});

var auctions;
db.view('auctions/all', function(err, data) {
  if(err) console.log(err);
  auctions = data;   
});
var auction = require('./models/auction');
var connections = {
  id: 'connections',
  active: 0
};
var user = function(userObj) {
  this.username = userObj.username || 'Anonymous';
  this.isAuthenticated = userObj ? true : false;
  this.password = userObj.password === userObj.confirm ? userObj.password : null;
  this.email = userObj.email || null;
  this.address1 = userObj.address1 || null;
  this.address2 = userObj.address2 || null;

  this.logout =  function() {
    user.name = 'Anonymous';
    user.isAuthenticated = false;
  };
  this.login = function(message) {
    if(validate(message)) {
      user.name = message.name;
      user.password = message.password;
      user.id = 'user';
      user.isAuthenticated = true;
      return true;
    }  
    return false;
  };
  register = function(message) {
    user.name = message.name;
    user.password = message.password;
    user.confirm = message.confirm;
    user.email = message.email;
    user.id = 'user';
    user.isAuthenticated = true;
  };
}

// -- heartbeat
setInterval(function() {
  if(auction.milliseconds >= 1000) {                       
    auction.milliseconds -= 1000;
    auction.time = formatTime(auction.milliseconds);
  }
}, 1000);

// -- fastest form of communication
socket.on('connection', function(client){

  function send(obj) {
    client.send(JSON.stringify(obj));
  }

  function broadcast(obj) {
    send(obj);
    client.broadcast(JSON.stringify(obj));
  }

  client.redirect = function(url) {
    send({id:'url',
          url:url});
  }                        

  client.connectSession = function(fn) {
    var cookie = client.request.headers.cookie;
    var sid = cookie.match(/connect\.sid=([^;]+)/)[1]
    var session = {};
//    redis.get(sid, function(err, data) {
//      fn(err, JSON.parse(data));
//    });
  };

  connections.active++;
  broadcast(connections);

  client.on('message', function(message){

    try {
      message = JSON.parse(message);
    } catch(e) { 
      // parse a form message instead
      var inputs = message.split('&');
      var message = {};
      inputs.forEach(function(item) {
        var pair = item.split('=');
        message[pair[0]] = pair[1];
        //console.log(message);
      });
    }

    console.log('(' + new Date() + ') event: ' + message.id);
    if (message.id === 'bid') {
      auction.id = 'auction';
      auction.bidder = user.name;
      auction.bids++;
      auction.price += 0.01;
      auction.time += 1000 * 30;
      user.account -= 0.60;
      send(user);  
      broadcast(auction);  
    } else if (message.id === 'update') {
      broadcast(auction);  
    } else if (message.id === 'register') {
      user.register(message)
      send(user);
    } else if (message.id === 'login') {
      if(user.login(message)) {
        client.redirect('/');
        send(user);
      }
    } else if (message.id === 'purchase') {
      user.credits += message.bids;
      user.balance -= (message.bids * 0.60);
      send(user);
    } else if (message.id === 'undefined') {
      console.log('error');
      console.log(message);
    };

  });

  client.on('disconnect', function(){
    connections.active--;
    broadcast(connections);
  });

});

// --
function validate(user) {
    if(user.password === 'yoho') {
      return true;
    }
    return false;
}

// -- catch all routes & parse
app.post('*', function(req, res) {
  //console.log(req.body);
  switch(req.originalUrl) {
    case '/bid':
      auction.bidder = user.name;
      auction.bids++;
      auction.price += 1.00;
      auction.time += 1000;
      break;
    default:
  }
  // TODO save submitted data
  // TODO initiate session
  // TODO control auth
  res.redirect('/');
});

app.get('/logout', function(req, res) {
  user.logout();
  res.redirect('/login');
});

// -- catch all routes & serve
app.get('*', function(req, res) {
  var template = req.params[0].substr(1);
  if (req.originalUrl === '/') template = 'index';
  var msg = {};
  msg.originalUrl = req.originalUrl;
  msg.location = req.location;
  msg.method = req.method;
  msg.headers = req.headers;
  fs.readFile('./views/' + template + '.jade', 
              "utf8", 
              function(err, data) {
                if (err) { 
                  template = 'error';
                };
                auction.time = formatTime(auction.milliseconds);
                res.render(template + '.jade', { 
                  locals: {
                    user: user,
                    model: auction,
                    pageTitle: template
                  } 
                });
              });
  });

// -- 
port = 8080;
app.listen(port);
console.log('listening on ' + port);

function formatTime(milliseconds) {
  seconds = milliseconds / 1000;
  minutes = Math.floor(seconds / 60);
  remainderSeconds = (seconds % 60).toString();
  if ( remainderSeconds.length == 1 ) {
    remainderSeconds = '0' + remainderSeconds;
  }
  return minutes + ":" + remainderSeconds;
}
