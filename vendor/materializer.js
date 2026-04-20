//==============================================================================
// materializer.js
// requires epilog.js//==============================================================================
//==============================================================================
// staticbases
//==============================================================================

function staticbases (rules)
 {var views = getviews(rules);
  var bases = [];
  for (var i=0; i<views.length; i++)
      {if (views[i]==='role') {continue};
       if (views[i]==='base') {continue};
       if (views[i]==='action') {continue};
       if (views[i]==='init') {continue};
       if (views[i]==='legal') {continue};
       if (views[i]==='goal') {continue};
       if (views[i]==='terminal') {continue};
       if (atomviewp(views[i],rules)) {bases.push(views[i])}}
  return bases}

function atomviewp (rel,rules)
 {var flag = false;
  for (var i=0; i<rules.length; i++)
      {if (rules[i]===rel) {flag = true};
       if (symbolp(rules[i])) {continue};
       if (rules[i][0]===rel) {flag = true};
       if (rules[i][0]==='rule' && operator(rules[i])===rel) {return false}}
  return flag}

//==============================================================================
// staticviews
//==============================================================================

function staticviews (rules)
 {var bases = dynamicbases(rules); console.log(bases);
  var views = getviews(rules); console.log(views);
  var results = ['role','base','action','init'];
  for (var i=0; i<views.length; i++)
      {if (views[i]==='role') {continue};
       if (views[i]==='base') {continue};
       if (views[i]==='action') {continue};
       if (views[i]==='init') {continue};
       if (atomviewp(views[i],rules)) {continue};
       if (!dependentp(views[i],bases,rules)) {results.push(views[i])}};
  console.log(results);
  return results}

function dependentp (rel,atoms,rules)
 {if (builtinp(rel)) {return false};
  if (mathp(rel)) {return false};
  if (listop(rel)) {return false};
  if (aggregatep(rel)) {return false};
  if (find(rel,atoms)) {return true};
  for (var i=0; i<rules.length; i++)
      {if (symbolp(rules[i])) {continue};
       if (rules[i][0]===rel) {continue};
       if (rules[i][0]==='rule' &&
           operator(rules[i][1])===rel &&
           depends(maksand(rules[i].slice(2)),atoms,rules))
          {return true}};
  return false}
  
function depends (p,atoms,rules)
 {if (symbolp(p)) {return find(p,atoms)};
  if (p[0]==='not') {return depends(p[1],atoms,rules)};
  if (p[0]==='and' || p[0]==='or')
     {for (var i=1; i<p.length; i++)
          {if (depends(p[i],atoms,rules)) {return true}};
      return false};
  return dependentp(operator(p),atoms,rules)}

//==============================================================================
// dynamicbases
//==============================================================================

function dynamicbases (rules)
 {var results = [];
  for (var i=0; i<rules.length; i++)
      {if (symbolp(rules[i])) {continue};
       if (rules[i][0]==='base')
          {results = adjoin(operator(rules[i][1]),results)}
       if (rules[i][0]==='rule' &&
           ~symbolp(rules[i][1]) &&
           rules[i][1][0]==='base')
          {results = adjoin(operator(rules[i][1][1]),results)}}
  return results}

//==============================================================================
// dynamicviews
//==============================================================================

function dynamicviews (rules)
 {var bases = dynamicbases(rules);
  var views = getviews(rules);
  var results = [];
  for (var i=0; i<views.length; i++)
      {if (views[i]==='legal') {continue};
       if (views[i]==='goal') {continue};
       if (views[i]==='terminal') {continue};
       if (atomviewp(views[i],rules)) {continue};
       if (dependentp(views[i],bases,rules)) {results.push(views[i])}};
  return results}

//==============================================================================
// materializestaticrelations
//==============================================================================

function materializestaticrelations (rules)
 {var views = staticviews(rules);
  for (var i=0; i<views.length; i++)
      {materializestaticrelation(views[i],rules)};
  return rules}

function materializestaticrelation (rel,rules)
 {var pattern = makepattern(rel,getrulearity(rel,rules))
  var newdata = compfinds(pattern,pattern,[],rules);
  eliminaterules(rel,rules);
  definemorerules(rules,newdata);
  return true}

function eliminaterules (rel,theory) {var data = indexees(rel,theory).concat();  for (var i=0; i<data.length; i++)      {if (operator(data[i])===rel) {uninsertrule(data[i],theory)}};  return rel}

//==============================================================================
// materializerelations
//==============================================================================

function materializerelations (rules)
 {var views = dynamicviews(rules);
  var newrules = rules;
  for (var i=0; i<views.length; i++)
      {if (true || dynaprojectionp(views[i],rules,nil))
          {newrules = materialize(views[i],newrules)}};
  var operations = getoperations(rules); console.log(operations);
  for (var i=0; i<operations.length; i++)
      {var pattern = makepattern(operations[i],getoperationarity(operations[i],rules));
       newrules.push(seq('handler',pattern,'materialize'))};
         return newrules}

function materialize (rel,rules)
 {var oldpattern = makepattern(rel,getrulearity(rel,rules));

  var inits = findinits(rules);
  var newrules = basefinds(seq('init',oldpattern),oldpattern,inits,rules);

  for (var i=0; i<rules.length; i++)
      {if (symbolp(rules[i])) {newrules.push(rules[i]); continue};
       if (rules[i][0]==='rule' && operator(rules[i][1])===rel)
          {var addition = seq('transition',maksand(rules[i].slice(2)),rules[i][1]);
           newrules.push(seq('handler','materialize',addition));
           continue};
       newrules.push(rules[i])};
  var deletion = seq('transition',oldpattern,makenegation(oldpattern));
  newrules.push(seq('handler','materialize',deletion));

  return newrules}

function getoperations (data)
 {var operations = [];
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {continue};
       if (data[i][0]==='action')
          {operations = adjoin(operator(data[i][1]),operations)}};
  return operations}

function getoperationarity (operation,rules) {for (var i=0; i<rules.length; i++)      {if (symbolp(rules[i])) {continue};
       if (rules[i][0]!=='action') {continue};
       if (rules[i][1]===operation) {return 0};
       if (symbolp(rules[i][1])) {continue};
       if (rules[i][1][0]===operation) {return rules[i][1].length-1}};  return 0}

//==============================================================================
// dematerializerelations
//==============================================================================

function dematerializerelations (rules)
 {var bases = getbaserelations(rules);
  var newrules = seq();
  for (var i=0; i<bases.length; i++)
      {if (!checkusep(bases[i],rules,nil))
          {var rule = spdefinition(bases[i],rules);
           if (rule) {newrules = dematerialize(rule,rules,nil)}}};
  return newrules}

function getbaserelations (rules)
 {var data = findbases(rules);
  var ans = seq();
  for (var i=0; i<data.length; i++)
      {ans = adjoin(operator(data[i]),ans)};
  return ans}

function checkusep (rel,rules,nl)
 {if (find(rel,nl)) {return false};
  var data = viewindexps(rel,rules);
  for (var i=0; i<data.length; i++)
      {if (checkrulep(rel,data[i],rules,nl)) {return true}};
  return false}

function checkrulep (rel,rule,rules,nl)
 {if (symbolp(rule)) {return false};
  if (rule[0]!=='rule') {return false};
  if (operator(rule[1])!==rel) {return false};
  for (var i=2; i<rule.length; i++)
      {if (!symbolp(rule[i]) && rule[i][0]==='true' && operator(rule[i][1])===rel)
          {return true}};
  return false}

function spdefinition (rel,rules)
 {var data = viewindexps('next',rules);
  var rule = false;
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {true}
       else if (data[i][0]!=='rule') {true}
       else if (operator(data[i][1])==='next' && operator(data[i][1][1])===rel)
               {if (rule) {return false}
                else if (data[i].length>3) {return false}
                else {rule = data[i]}}};
  return rule}

function dematerialize (rule,rules)
 {var rel = operator(rule[1][1]);
  var newrules = seq();
  for (var i=0; i<rules.length; i++)
      {if (rules[i]===rule) {true}
       else if (symbolp(rules[i])) {newrules.push(rules[i])}
       else if (rules[i][0]==='base' && operator(rules[i][1])===rel) {true}
       else if (rules[i][0]==='init' && operator(rules[i][1])===rel) {true}
       else if (rules[i][0]!=='rule') {newrules.push(rules[i])}
       else if (symbolp(rules[i][1])) {newrules.push(rules[i])}
       else if (rules[i][1][0]==='base' && operator(rules[i][1][1])===rel) {true}
       else if (rules[i][1][0]==='init' && operator(rules[i][1][1])===rel) {true}
       else {newrules.push(dematerializerule(rule,rules[i]))}};
  return newrules}

function dematerializerule (source,target)
 {var newrule = seq('rule',target[1]);
  for (var i=2; i<target.length; i++)
      {var al = seq();
       var bl = seq();
       if (vnify(source[1],al,target[i],bl,seq()))
          {newrule.push(pluug(source[2],al,bl))}
       else {newrule.push(target[i])}};
  return newrule}

//==============================================================================
// End
//==============================================================================
