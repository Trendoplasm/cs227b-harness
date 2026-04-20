//==============================================================================
// onestep.js
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
  return playonestep(role)}

function stop (move)
 {return false}

function abort ()
 {return false}

//==============================================================================
// onestep
//==============================================================================

function playonestep (role)
 {console.log(state);
  var actions = shuffle(findlegals(state,library));
  if (actions.length===0) {return false};
  var action = actions[0];
  var score = 0;
  for (var i=0; i<actions.length; i++)
      {console.log('  ' + grind(actions[i]));
       var newstate = simulate(actions[i],state,library);
       var newscore = findreward(role,newstate,library)*1;
       console.log('  ' + newscore);
       if (newscore===100) {return actions[i]};
       if (newscore>score) {action = actions[i]; score = newscore}};
  return action}

function bestonestep (role,state)
 {console.log(state);
  var actions = shuffle(findlegals(state,library));
  if (actions.length===0) {return false};
  var action = actions[0];
  var terminal = false;
  var score = 0;
  for (var i=0; i<actions.length; i++)
      {console.log('  ' + grind(actions[i]));
       var newstate = simulate(actions[i],state,library);
       var newterm = findterminalp(newstate,library);
       var newscore = findreward(role,newstate,library)*1;
       console.log('  ' + newscore);
       if (newterm && newscore===100) {return actions[i]};
       if (newterm===terminal)
          {if (newscore>score) {action = actions[i]; score = newscore}};
       if (newterm && newscore>0)
          {action = actions[i]; terminal = true; score = newscore}};
  return action}

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
