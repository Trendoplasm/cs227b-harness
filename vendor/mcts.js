//==============================================================================
// pts.js//==============================================================================

var role = 'robot';
var rules = [];
var startclock = 10;
var playclock = 10;

var library = [];
var roles = [];
var state = [];
var tree = {};

//==============================================================================

function ping ()
 {return 'ready'}

function start (r,rs,sc,pc)
 {role = r;
  rules = rs.slice(1);
  startclock = numberize(sc);
  playclock = numberize(pc);

  library = definemorerules([],rules);
  roles = findroles(library);
  state = findinits(library);
  var active = findcontrol(state,library);
  var reward = parseInt(findreward(role,state,library));
  tree = makenode(state,active,reward,false);

  return 'ready'}

function play (move)
 {if (move!==nil) {tree = subtree(move,tree); state = tree.state};
  if (findcontrol(state,library)!==role) {return false};
  return playmcts(move)}

function stop (move)
 {return false}

function abort ()
 {return false}

//==============================================================================

function makenode (state,mover,utility,complete)
 {return {state:state,
          actions:[],
          children:[],
          mover:mover,
          utility:utility,
          visits:0,
          probes:0,
          complete:complete}}

//==============================================================================
// mcts
//==============================================================================

var nodes = 0;
var terminals = 0;
var depthcharges = 0;

function playmcts (move)
 {nodes = 1;
  terminals = 0;
  depthcharges = 0;

  var deadline = Date.now()+Math.floor(playclock/2)*1000;
  while (Date.now()<deadline && !tree.complete) {processnode(tree)};
  deadline = deadline+(playclock/2-2)*1000;
  while (Date.now()<deadline && !tree.complete) {explorenode(tree)};
  var move = selectaction(tree);

  console.log("Nodes: " + nodes);
  console.log("Terminals: " + terminals);
  console.log("Probes: " + depthcharges);
  console.log("Utility: " + tree.utility);
  console.log("Complete: " + tree.complete);
  console.log("");

  return move}

//==============================================================================

function subtree (move,node)
 {if (node.children.length===0)
     {var newstate = simulate(move,node.state,library);
      var newmover = findcontrol(newstate,library);
      var newscore = parseInt(findreward(role,newstate,library));
      var newcomplete = findterminalp(newstate,library);
      return makenode(newstate,newmover,newscore,newcomplete)};
  for (var i=0; i<node.actions.length; i++)
      {if (equalp(move,node.actions[i])) {return node.children[i]}}
  return node}

//==============================================================================
// expand
//==============================================================================

function processnode (node)
 {if (node.children.length===0) {expand(node)}
     else {processnode(selectnode(node))};
  updatenode(node);
  return true}

//==============================================================================

function selectnode (node)
 {var child = node.children[0];
  var visits = node.visits;
  for (var i=0; i<node.children.length; i++)
      {var newchild = node.children[i];
       if (newchild.complete) {continue};
       var newvisits = newchild.visits;
       if (newvisits<visits) {child = newchild; visits = newvisits}};
  return child}

//==============================================================================

function expand (node)
 {node.actions = shuffle(findlegals(node.state,library));
  for (var i=0; i<node.actions.length; i++)
      {var newstate = simulate(node.actions[i],node.state,library);
       var newmover = findcontrol(newstate,library);
       var newscore = parseInt(findreward(role,newstate,library));
       var newcomplete = findterminalp(newstate,library);
       node.children[i] = makenode(newstate,newmover,newscore,newcomplete);
       if (newcomplete) {terminals++};
       nodes++};
  return true}

function shuffle (array)
 {for (var i = array.length-1; i>0; i--)
      {var j = Math.floor(Math.random() * (i + 1));
       var temp = array[i];
       array[i] = array[j];
       array[j] = temp};
  return array}

//==============================================================================

function updatenode (node)
 {node.utility = (node.mover===role) ? scoremax(node) : scoremin(node);
  node.complete = (node.mover===role) ? checkmax(node) : checkmin(node);
  node.visits = node.visits+1;
  return true}

function scoremax (node)
 {var score = node.children[0].utility;
  for (var i=1; i<node.children.length; i++)
      {var newscore = node.children[i].utility;
       if (newscore>score) {score = newscore}};
  return score}

function scoremin (node)
 {var score = node.children[0].utility;
  for (var i=1; i<node.children.length; i++)
      {var newscore = node.children[i].utility;
       if (newscore<score) {score = newscore}};
  return score}

function checkmax (node)
 {var flag = true;
  for (var i=0; i<node.children.length; i++)
      {if (!node.children[i].complete) {flag = false; continue};
       if (node.children[i].utility===100) {return true}};
  return flag}

function checkmin (node)
 {var flag = true;
  for (var i=0; i<node.children.length; i++)
      {if (!node.children[i].complete) {flag = false; continue};
       if (node.children[i].utility===0) {return true}};
  return flag}

function checkcomplete (node)
 {for (var i=0; i<node.children.length; i++)
      {if (!node.children[i].complete) {return false}};
  return true}

//==============================================================================

function selectaction (node)
 {var action = node.actions[0];
  var score = -1;
  for (var i=0; i<node.children.length; i++)
      {var child = node.children[i];
       if (child.complete && child.utility===100) {return node.actions[i]};
       if (child.complete && child.utility===0) {continue};
       var newscore = child.utility;
       if (newscore>score) {action = node.actions[i]; score = newscore}};
  return action}

//==============================================================================
// explore
//==============================================================================

function explorenode (node)
 {if (node.children.length===0) {return sample(node)}
     else {explorenode(selectnode(node))};
  updatenode(node);
  return true}

function sample (node)
 {var utility = node.utility;
  var probes = node.probes;
  var score = depthcharge(node.state);
  node.utility = Math.round((utility*probes+score)/(probes+1));
  node.probes = node.probes + 1;
  depthcharges++;
  return true}

//==============================================================================

function depthcharge (state)
 {if (findterminalp(state,library)) {return findreward(role,state,library)*1};
  var actions = findlegals(state,library);
  if (actions.length===0) {console.log(state)};
  var best = randomindex(actions.length);
  var newstate = simulate(actions[best],state,library);
  return depthcharge(newstate)}

function randomindex (n)
 {return Math.floor(Math.random()*n)}

//==============================================================================
// debugging stuff
// findnode - recursive selection - same as processnode but does not update
// process - calls processnode n times
//==============================================================================

function findnode (node)
 {if (node.children.length===0) {return node};
  return findnode(selectnode(node))}

function process (node,n)
 {for (var i=0; i<n; i++) {processnode(node)};
  return true}

//==============================================================================
// End of player code
//==============================================================================
