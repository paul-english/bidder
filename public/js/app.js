$(function() {
  $('form').submit(function() {
    socket.send($(this).serialize());
    return false;
  });
});

setInterval(function() {
  socket.send(JSON.stringify({id:'update'}));
}, 1000);

io.setPath('/Socket.IO/');

var socket = new io.Socket('firstleft.net');

socket.connect();
socket.on('connect', function(){
});
socket.on('message', function(data){
  var obj = JSON.parse(data);
  if (obj.id === "connections") {
    $('.connections').html(obj.active);
  } else if (obj.id === "auction") {
    $('.title').html(obj.title);
    $('.price').html(obj.price)
    $('.time').html(obj.time)
    $('.bidder').html(obj.bidder)
    $('.bids').html(obj.bids)
  } else if (obj.id === "user") {
    $('.user .name').html(obj.name);
  } else if (obj.id === "url") {
    window.location = obj.url;
  } else {
    console.log(obj.id);
  }
});
socket.on('disconnect', function() {
  setTimeout(function() {
    window.location = '/';
  }, 2000);
});
