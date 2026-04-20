//==============================================================================
// twostep.js
//==============================================================================

var role = 'robot';
var rules = [];
var startclock = 10;
var playclock = 10;

var library = [];
var roles = [];
var state = [];

//==============================================================================

function ping ()
 {return 'ready'}

function start (r,rs,sc,pc)
 {role = r;
  rules = rs.slice(1);
  startclock = numberize(sc);
  playclock = numberize(pc);
  library = definemorerules([],rs.slice(1));
  roles = findroles(library);
  state = findinits(library);
  return 'ready'}

function play (move)
 {if (move!==nil) {compexecute(move,state,library)};
  if (findcontrol(state,library)!==role) {return false};
  return playminimaxdepth(role)}

function stop (move)
 {return false}

function abort ()
 {return false}

//==============================================================================
// minimaxdepth//==============================================================================

var depth = 2;
var nodes = 0;
var terminals = 0;
var elapsed = 0;

function playminimaxdepth (role) {var actions = shuffle(findlegals(state,library));
  if (actions.length===0) {return false};
  if (actions.length===1) {return actions[0]};
  var action = actions[0];
  var score = 0;
  nodes = 0
  for (var i=0; i<actions.length; i++)
      {//console.log(grind(actions[i]));
       var newstate = simulate(actions[i],state,library);
       var newscore = minimaxdepth(role,newstate,depth);
       //console.log(newscore);
       if (newscore===100) {return actions[i]};
       if (newscore>score) {action = actions[i]; score = newscore}};
  return action}

function testminimaxdepth (role,state)
 {nodes = 0;
  terminals = 0;
  var beg = performance.now();
  var result = minimaxdepth(role,state,depth);
  var end = performance.now();
  elapsed = Math.round(end-beg);
  return result}

function minimaxdepth (role,state,depth) {nodes = nodes + 1;
  if (findterminalp(state,library))
     {terminals = terminals + 1; return findreward(role,state,library)*1};
  if (depth<=0) {terminals = terminals + 1; return findreward(role,state,library)*1};  var active = findcontrol(state,library);
  if (active===role) {return maximizedepth(active,role,state,depth)};
  return minimizedepth(active,role,state,depth)}

function maximizedepth (active,role,state,depth)
 {var actions = findlegals(state,library);
  if (actions.length===0) {return 0};
  var score = 0;
  for (var i=0; i<actions.length; i++)
      {var newstate = simulate(actions[i],state,library);
       var newscore = minimaxdepth(role,newstate,depth-1);
       if (newscore===100) {return 100};
       if (newscore>score) {score = newscore}};
  return score}

function minimizedepth (active,role,state,depth)
 {var actions = findlegals(state,library);
  if (actions.length===0) {return 0};
  var score = 100;
  for (var i=0; i<actions.length; i++)
      {var newstate = simulate(actions[i],state,library);
       var newscore = minimaxdepth(role,newstate,depth-1);
       if (newscore===0) {return 0};
       if (newscore<score) {score = newscore}};
  return score}

function betterp (x,y)
 {if (x[0]>y[0]) {return true};
  if (x[0]===y[0]) {return (x[1]>y[1])};
  return false}

function worsep (x,y)
 {if (x[0]<y[0]) {return true};
  if (x[0]===y[0]) {return (x[1]<y[1])};
  return false}

function shuffle (array)
 {for (var i = array.length-1; i>0; i--)
      {var j = Math.floor(Math.random() * (i + 1));
       var temp = array[i];
       array[i] = array[j];
       array[j] = temp};
  return array}

//==============================================================================
// End of player code
//==============================================================================
