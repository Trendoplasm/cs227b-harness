//==============================================================================
// localstorage.js
//==============================================================================

indexing = false;
dataindexing = false;
ruleindexing = true;

var manager = 'manager';
var player = 'anonymous';

//==============================================================================

function doinitialize ()
 {window.addEventListener("storage",handlestorage,false);
  return true}

function doplayer ()
 {player = read(prompt("What is your player's identifier?"));
  document.getElementById('player').innerHTML = player;
  return true}

//==============================================================================

function handlestorage (ev)
 {//console.log(ev);
  if (ev.key!==player) {return false};
  var transcript = document.getElementById('transcript');
  transcript.value = transcript.value + ev.newValue + "\n";
  var answer = handlemessage(read(ev.newValue));
  if (!answer) {console.log("Player: no response"); return false};
  send(grind(answer));
  return true}

function handlemessage (envelope)
 {var msgid = envelope[1];
  var sender = envelope[2];
  var receiver = envelope[3];
  var message = envelope[4];
  if (sender!==manager) {return false};
  if (receiver!==player) {return false};
  var answer = ggpeval(message);
  if (answer) {return seq('message',msgid,player,manager,answer)};
  return false}

function send (str)
 {var transcript = document.getElementById('transcript');
  transcript.value = transcript.value + str + "\n";
  localStorage[manager] = str;
  return true}

//==============================================================================

function ggpeval (msg)
 {if (symbolp(msg)) {return false};
  if (msg[0]==='ping') {return ping()};
  if (msg[0]==='start') {return start(msg[1],msg[2],msg[3],msg[4])};
  if (msg[0]==='play') {return play(msg[1])};
  if (msg[0]==='stop') {return stop(msg[1])};
  if (msg[0]==='abort') {return abort()};
  return false}

//==============================================================================
// communication with gamemaster
//==============================================================================

function getruleset (game)
 {return seq('rulesheet').concat(readdata(getrulesheet(game)))}

function getrules (game)
 {return readdata(getrulesheet(game))}

function getrulesheet (game)
 {var url = 'http://gamemaster.stanford.edu/homepage/rulesheet.php?game=' + game;
  return geteval(url)}
  
function getrulesheet (game)
 {var url = 'http://localhost/gamemaster/homepage/rulesheet.php?game=' + game;
  return geteval(url)}
  
function getstylesheet (game)
 {var url = 'http://gamemaster.stanford.edu/homepage/stylesheet.php?game=' + game;
  return geteval(url)}

function geteval (url)
 {request = new XMLHttpRequest();
  request.overrideMimeType('text/plain');
  request.open('GET',url,false);
  request.send();
  return request.responseText}

//==============================================================================
// End of protocol code
//==============================================================================
