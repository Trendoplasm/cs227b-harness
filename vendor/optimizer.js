//==============================================================================
// optimizer code
//==============================================================================
//==============================================================================
// fixrules = ordersubgoals
//==============================================================================

function fixrules (rules)
 {var newrules = seq();
  for (var i=0; i<rules.length; i++)
      {if (symbolp(rules[i])) {newrules.push(rules[i])}
       else if (rules[i][0]=='rule') {newrules.push(fixrule(rules[i]))}
       else {newrules.push(rules[i])}};
  return newrules}

function fixrule (rule)
 {var vl = seq();
  var sl = rule.slice(2);
  var newrule = seq('rule',rule[1]);
  while (sl.length>0)
   {var ans = getbest(sl,vl);
    newrule.push(ans);
    vl = varsexp(ans,vl)};
  return newrule}

function getbest (sl,vl)
 {var varnum = 10000;
  var best = 0;
  for (var i=0; i<sl.length; i++)
      {var dum = unboundvarnum(sl[i],vl);
       if (dum<varnum && (symbolp(sl[i]) || sl[i][0]!=='not' || dum===0))
          {varnum = dum; best = i}};
  var ans = sl[best];
  sl.splice(best,1);
  return ans}

function fixrule (rule)
 {var vl = seq();
  var sl = rule.slice(2);
  var newrule = seq('rule',rule[1]);
  while (sl.length>0)
   {var ans = getbest(sl,vl);
    if (ans) {newrule.push(ans)}
    else {newrule.push(sl[0]);
          vl = varsexp(sl[0],vl);
          sl.splice(0,1)}}
  return newrule}
  
function getbest (sl,vl)
 {for (var i=0; i<sl.length; i++)
      {if (groundedp(sl[i],vl))
          {var ans = sl[i]; sl.splice(i,1); return ans}}
  return false}

function unboundvarnum (x,vs)
 {return unboundvars(x,seq(),vs).length}

function unboundvars (x,us,vs) {if (varp(x)) {if (find(x,vs)) {return us} else {return adjoin(x,us)}};  if (symbolp(x)) {return us};  for (var i=0; i<x.length; i++)
      {us = unboundvars(x[i],us,vs)};  return us}

//==============================================================================
// prunerulesubgoals
//==============================================================================

function prunerulesubgoals (rules)
 {var newrules = seq();
  for (var i=0; i<rules.length; i++)
      {if (symbolp(rules[i])) {newrules.push(rules[i])}
       else if (rules[i][0]=='rule') {newrules.push(prunesubgoals(rules[i]))}
       else {newrules.push(rules[i])}};
  return newrules}

function prunesubgoals (rule)
 {var vl = vars(rule[1]);
  var newrule = seq('rule',rule[1]);
  for (var i=2; i<rule.length; i++)
      {if (!symbolp(rule[i]) &&
           (rule[i][0]==='not' || rule[i][0]==='or' ||
            rule[i][0]==='same' || rule[i][0]==='distinct' ||
            rule[i][0]==='plus' || rule[i][0]==='minus'))
          {newrule.push(rule[i]); continue};
       if (!pruneworthyp(newrule.slice(2).concat(rule.slice(i+1)),rule[i],vl))
          {newrule.push(rule[i])}};
  return newrule}

function pruneworthyp (sl,p,vl)
 {vl = varsexp(sl,vl.slice(0));
  var al = seq();
  for (var i=0; i<vl.length; i++)
      {al[vl[i]] = 'x' + i};
  var facts = sublis(sl,al);
  var goal = sublis(p,al);
  return basefindp(goal,facts,seq())}

function sublis (x,al) {if (varp(x)) {if (al[x]) {return al[x]} else return x};  if (symbolp(x)) {return x};  var exp = seq();  for (var i=0; i<x.length; i++)      {exp[i] = sublis(x[i],al)};  return exp}

//==============================================================================
// prunerules
//==============================================================================

function prunerules (rules)
 {var newrules = seq();
  for (var i=0; i<rules.length; i++)
      {if (!subsumedp(rules[i],newrules) && !subsumedp(rules[i],rules.slice(i+1)))
          {newrules.push(rules[i])}};
  return newrules}

function subsumedp (rule,rules)
 {for (i=0; i<rules.length; i++)
      {if (subsumesp(rules[i],rule)) {return true}};
  return false}

function subsumesp (p,q)
 {if (equalp(p,q)) {return true};
  if (symbolp(p) || symbolp(q)) {return false};
  if (p[0]==='rule' && q[0]==='rule')
     {var al = matcher(p[1],q[1]);
      if (al!==false  && subsumesexp(p.slice(2),q.slice(2),al))
         {return true}};
  return false};

function subsumesexp (pl,ql,al)
 {if (pl.length===0) {return true};
  for (var i=0; i<ql.length; i++)
      {var bl = match(pl[0],ql[i],al);
       if (bl!==false && subsumesexp(pl.slice(1),ql,bl))
          {return true}};
  return false}

//==============================================================================
// End
//==============================================================================
