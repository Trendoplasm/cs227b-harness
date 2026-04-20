//==============================================================================
// simplifier.js
// assumes rules are grounded
//==============================================================================
//==============================================================================
// simplifyrules
//==============================================================================

function simplifyrules (rules)
 {var atoms = getatoms(rules)
  var newrules = [];
  for (var i=0; i<rules.length; i++)
      {var result = simplifyit(rules[i],atoms);
       if (result===false) {continue};
       newrules.push(result)};
  return newrules}

function simplifyit (rule,atoms)
 {if (symbolp(rule)) {return rule};
  if (rule[0]==='rule') {return simplifyrule(rule,atoms)};
  if (rule[0]==='handler') {return simplifyhandler(rule,atoms)};
  return rule}

function simplifyrule (rule,atoms)
 {var subgoals = [];
  for (var i=2; i<rule.length; i++)
      {var result = simplifysubgoal(rule[i],atoms);
       if (result===true) {continue};
       if (result===false) {return false};
       subgoals.push(rule[i])};
  if (subgoals.length===0) {return rule[1]};
  return seq('rule',rule[1]).concat(subgoals)}

function simplifyhandler (rule,atoms)
 {if (symbolp(rule[2])) {return rule};
  if (rule[2][0]!=='transition') {return rule};
  var transition = rule[2];
  var condition = transition[1];
  var conclusion = transition[2];
  if (symbolp(condition) || condition[0]!=='and')
     {var result = simplifysubgoal(condition,atoms);
      if (result===true) {return seq('handler',rule[1],conclusion)};
      if (result===false) {return false};
      return seq('handler',rule[1],seq('transition',condition,conclusion))};
  var subgoals = [];
  for (var i=1; i<condition.length; i++)
      {var result = simplifysubgoal(condition[i],atoms);
       if (result===true) {continue};
       if (result===false) {return false};
       subgoals.push(condition[i])};
  if (subgoals.length===0) {return seq('handler',rule[1],conclusion)};
  return seq('handler',rule[1],seq('transition',maksand(subgoals),conclusion))}

// if grounder has passed built-in through, then must be true.

function simplifysubgoal (p,atoms)
 {if (symbolp(p) && findp(p,atoms)) {return true};
  if (symbolp(p)) {return p};
  if (p[0]==='plus') {return true};
  if (p[0]==='minus') {return true};
  if (p[0]==='leq') {return true};
  if (p[0]==='same') {return true};
  if (p[0]==='distinct') {return true};
  if (p[0]==='not') {if (findp(p,atoms)) {return false} else {return p}};
  if (findp(p,atoms)) {return true};
  return p}

//==============================================================================
// getatoms
//==============================================================================

function getatoms (rules)
 {var atoms = [];
  for (var i=0; i<rules.length; i++)
      {if (symbolp(rules[i])) {atoms.push(rules[i])};
       if (rules[i][0]==='rule') {continue};
       if (rules[i][0]==='handler') {continue};
       atoms.push(rules[i])};
  return atoms}

//==============================================================================
//==============================================================================
//==============================================================================

