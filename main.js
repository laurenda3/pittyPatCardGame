// main.js

// ======= Game state =======
const PLAYER_COUNT = 3;

let deckId = '';
let playerHands = [[], [], []];      // [You, P2 (left), P3 (right)]
let tableCard = null;

let dealerIndex = 0;                 // You are dealer for this build
let currentPlayerIndex = 0;

let remainingCards = 52;
let passesThisUpcard = 0;            // counts passes since last flip/match

let playerDiscards = [[], [], []];
let playerMatches  = [[], [], []];

// ======= UI refs =======
const yourHandEl = document.getElementById('player1');
const bot1HandEl  = document.getElementById('player2');
const bot2HandEl  = document.getElementById('player3');

const p1DisEl = document.getElementById('p1-discards');
const p2DisEl = document.getElementById('p2-discards');
const p3DisEl = document.getElementById('p3-discards');

const p1MatEl = document.getElementById('p1-matches');
const p2MatEl = document.getElementById('p2-matches');
const p3MatEl = document.getElementById('p3-matches');

const tableCardEl = document.getElementById('card-zone');
const deckCountEl = document.getElementById('deckCount');
const logEl       = document.getElementById('status');
const startBtn    = document.getElementById('playBtn');
const flashEl     = document.getElementById('flash');

// Announcements
const calloutMainEl = document.getElementById('callout-main');
const calloutSubEl  = document.getElementById('callout-sub');

// ======= Start =======
startBtn.addEventListener('click', startGame);
startGame();

// ======= Utilities =======
function flash(text, {win=false, holdMs=5000} = {}) {
  if (!flashEl) return;
  clearTimeout(flashEl._t);
  flashEl.className = 'flash' + (win ? ' win' : '');
  flashEl.textContent = text;
  requestAnimationFrame(()=>flashEl.classList.add('show'));
  if (!win) flashEl._t = setTimeout(()=>flashEl.classList.remove('show'), holdMs);
}
function showWinner(text){ flash(text,{win:true}); }
function setLog(msg){ logEl.textContent = msg; }
function updateDeckCount(n){ if (typeof n==='number') remainingCards=n;
  deckCountEl.textContent = `Cards remaining in deck: ${remainingCards}`; }

function valuesMatch(a,b){ return a.value === b.value; }
function countByRank(hand){ const m={}; for(const c of hand) m[c.value]=(m[c.value]||0)+1; return m; }
function rankCount(hand, rank){ return hand.reduce((n,c)=>n+(c.value===rank?1:0), 0); }
function isOut(hand){ if (hand.length===0) return true;
  const cnts=countByRank(hand); return Object.values(cnts).every(x=>x%2===0); }

// NOLA callout names
function rankToCallout(value){
  const v = String(value).toUpperCase();
  const map = {
    'ACE':'ace',
    '2':'deuce',
    '3':'trey',
    '4':"fo'",
    '5':'five',
    '6':'six',
    '7':'seven',
    '8':'eight',
    '9':'nine',
    '10':'ten',
    'JACK':'jack',
    'QUEEN':'queen',
    'KING':'king'
  };
  // Capitalize first letter only
  const word = map[v] || v.toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}
function playerCallout(idx){
  return idx===0 ? 'me' : String(idx+1); // "me", "2", "3"
}
function announce(main, sub=''){
  if (calloutMainEl) calloutMainEl.textContent = main || '';
  if (calloutSubEl)  calloutSubEl.textContent  = sub || '';
}

// First playable card code (matches upcard AND rank is odd in hand)
function playableCardCodeFor(hand){
  for (const c of hand) {
    if (c.value === tableCard.value && rankCount(hand, c.value) % 2 === 1) return c.code;
  }
  return null;
}
function playableMatchIndex(hand){
  for (let i=0;i<hand.length;i++){
    const c=hand[i];
    if (valuesMatch(c, tableCard) && rankCount(hand,c.value)%2===1) return i;
  }
  return -1;
}
function canMatch(h){ return playableMatchIndex(h)!==-1; }
function allowedExtraIndices(hand){
  const cnts=countByRank(hand), out=[];
  for(let i=0;i<hand.length;i++){ if (cnts[hand[i].value]%2===1) out.push(i); }
  return out;
}
function nextPlayer(i){ return (i+1)%PLAYER_COUNT; }

// ======= Game flow (authentic Pitty Pat flow) =======
function startGame(){
  startBtn.disabled=true;
  startBtn.textContent='Restart Game';
  playerHands=[[],[],[]];
  playerDiscards=[[],[],[]];
  playerMatches=[[],[],[]];
  passesThisUpcard = 0;
  setLog('Dealing…');
  announce('Dealing…','');

  fetch('https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1')
    .then(r=>r.json()).then(d=>{ deckId=d.deck_id; updateDeckCount(d.remaining); })
    .then(()=>fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=16`))
    .then(r=>r.json())
    .then(data=>{
      playerHands[0]=data.cards.slice(0,5);
      playerHands[1]=data.cards.slice(5,10);
      playerHands[2]=data.cards.slice(10,15);
      tableCard=data.cards[15];
      updateDeckCount(data.remaining);
      renderAll();

      const up = rankToCallout(tableCard.value);
      setLog('Dealer flipped the upcard. P2 starts.');
      announce(`${up} on 2`, '');
      flash('P2 to play');
      currentPlayerIndex = nextPlayer(dealerIndex);
      beginTurn();
    })
    .catch(err=>console.error(err));
}

function beginTurn(){
  const idx=currentPlayerIndex;
  const hand=playerHands[idx];

  // Announce whose card the upcard is on (before action)
  const up = rankToCallout(tableCard.value);
  announce(`${up} on ${playerCallout(idx)}`, '');

  // If player can match, they do it (human/bot paths below)
  if (canMatch(hand)) {
    if (idx === 0) {
      setLog(`Your turn — upcard ${tableCard.value}. Click your match.`);
      flash('Your turn');
      highlightPlayableInYourHand();
      return; // wait for click
    } else {
      return setTimeout(()=>botPlay(idx), 2500);
    }
  }

  // No match for this player -> PASS (no draws in authentic flow)
  setLog(`P${idx+1} passes`);
  flash(`P${idx+1} passes`);
  passesThisUpcard++;

  // If dealer just passed AND everyone has passed on this upcard -> dealer flips
  if (idx === dealerIndex && passesThisUpcard >= PLAYER_COUNT) {
    return dealerFlipCycle();
  }

  // Otherwise continue to next player with the same upcard
  currentPlayerIndex = nextPlayer(currentPlayerIndex);
  beginTurn();
}

function dealerFlipCycle(){
  if (remainingCards === 0) {
    setLog("Deck empty after full pass. Stalemate.");
    announce('Stalemate','Deck empty.');
    flash("Stalemate");
    return endRound();
  }

  fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=1`)
    .then(r=>r.json()).then(d=>{
      tableCard = d.cards[0];
      updateDeckCount(d.remaining);
      renderTable();

      const up = rankToCallout(tableCard.value);
      setLog(`Dealer flipped ${tableCard.value}`);
      announce(`${up} on 2`, 'Dealer flipped');
      flash(`Dealer flipped ${tableCard.value}`);
      passesThisUpcard = 0;
      currentPlayerIndex = nextPlayer(dealerIndex);
      beginTurn();
    })
    .catch(err=>console.error('Flip error:', err));
}

// ======= Human play =======
function onHumanCardClick(code){
  if (currentPlayerIndex!==0) return;

  const hand=playerHands[0];
  const i=hand.findIndex(c=>c.code===code); if (i===-1) return;
  const sel=hand[i];

  if (!valuesMatch(sel,tableCard)){ setLog("Doesn't match upcard"); flash('Illegal move'); return; }
  if (rankCount(hand,sel.value)%2===0){ setLog('That rank is paired (locked)'); flash('Locked pair'); return; }

  const prev=tableCard; const m=hand.splice(i,1)[0];
  tableCard=m; playerMatches[0].push({upcard:prev, match:m});
  renderAll();

  const up = rankToCallout(prev.value);
  setLog(`You matched ${m.value}`);
  announce(`I got that ${up}`, '');
  flash(`You matched ${m.value}`);
  passesThisUpcard = 0;

  if (isOut(hand)){ setLog('You are out — You Win!'); announce('Player 1 Wins!!',''); showWinner('You Win!!'); return endRound(); }
  askDiscard();
}
function askDiscard(){
  const hand=playerHands[0], allowed=allowedExtraIndices(hand);
  if (allowed.length===0){ setLog('No extra needed — you are out!'); announce('Player 1 Wins!!',''); showWinner('You Win!!'); return endRound(); }
  setLog('Discard one extra (unpaired ranks only)'); flash('Discard one extra');

  // rebind clicks only to allowed
  document.querySelectorAll('#player1 .card').forEach(el=>{
    const i=hand.findIndex(c=>c.code===el.dataset.code);
    if (allowed.includes(i)){
      el.onclick=()=>{ const ex=hand.splice(i,1)[0];
        tableCard=ex; playerDiscards[0].push(ex); renderAll();

        const exName = rankToCallout(ex.value);
        setLog(`You discarded ${ex.value}`);
        announce('', exName); // second line says what you "dissed"
        flash(`You discarded ${ex.value}`);

        if (isOut(hand)){ setLog('You are out — You Win!'); announce('Player 1 Wins!!',''); showWinner('You Win!!'); return endRound(); }

        // After your discard, pass to next player with this new upcard
        currentPlayerIndex = nextPlayer(currentPlayerIndex);
        beginTurn();
      };
      el.style.opacity=''; el.style.cursor='pointer';
    } else {
      el.onclick=()=>{ setLog('That rank is paired—cannot discard.'); flash('Locked pair'); };
      el.style.opacity='.55'; el.style.cursor='not-allowed';
    }
  });
}

// ======= Bot play =======
function botPlay(idx){
  const hand=playerHands[idx];
  const mi=playableMatchIndex(hand);
  if (mi===-1) return; // safety

  const prev=tableCard; const m=hand.splice(mi,1)[0];
  tableCard=m; playerMatches[idx].push({upcard:prev, match:m});
  renderAll();

  const upName = rankToCallout(prev.value);
  setLog(`P${idx+1} matched ${m.value}`);
  announce(`${playerCallout(idx)} got that ${upName}`, '');
  flash(`P${idx+1} matched ${m.value}`);
  passesThisUpcard = 0;

  if (isOut(hand)){ setLog(`P${idx+1} is out — wins!`); announce(`Player ${idx+1} Wins!!`,''); showWinner(`Player ${idx+1} Wins!!`); return endRound(); }

  // Discard extra from unpaired ranks
  const allowed=allowedExtraIndices(hand);
  const ei=allowed.length?allowed[0]:hand.length-1;
  const ex=hand.splice(ei,1)[0];
  tableCard=ex; playerDiscards[idx].push(ex); renderAll();

  const exName = rankToCallout(ex.value);
  setLog(`P${idx+1} discarded ${ex.value}`);
  announce('', exName);
  flash(`P${idx+1} discarded ${ex.value}`);

  if (isOut(hand)){ setLog(`P${idx+1} is out — wins!`); announce(`Player ${idx+1} Wins!!`,''); showWinner(`Player ${idx+1} Wins!!`); return endRound(); }

  currentPlayerIndex = nextPlayer(currentPlayerIndex);
  beginTurn();
}

// ======= Render =======
function renderAll(){ renderHands(); renderTable(); renderLanes(); }

/* highlight the playable card (if any) in your hand */
function highlightPlayableInYourHand(){
  const playableCode = playableCardCodeFor(playerHands[0]);
  document.querySelectorAll('#player1 .card').forEach((el)=>{
    el.classList.remove('playable','focus');
    if (el.dataset.code === playableCode){
      el.classList.add('playable','focus');
    }
  });
}

function renderTable(){
  tableCardEl.innerHTML = `<img src="${tableCard.image}" class="card" alt="${tableCard.value} of ${tableCard.suit}">`;
}

function renderHands(){
  // --- YOU (face up) ---
  const yourHand = playerHands[0].slice();
  const playableCode = playableCardCodeFor(yourHand);

  // Move playable to end so it stacks on top
  if (playableCode){
    const idx = yourHand.findIndex(c=>c.code===playableCode);
    if (idx !== -1) {
      const [p] = yourHand.splice(idx,1);
      yourHand.push(p);
    }
  }

  yourHandEl.innerHTML = yourHand.map(c=>{
    const isPlayable = c.code === playableCode;
    const classes = ['card'];
    if (isPlayable) classes.push('playable','focus');
    return `<img src="${c.image}" class="${classes.join(' ')}" data-code="${c.code}" title="${c.value} of ${c.suit}">`;
  }).join('');

  document.querySelectorAll('#player1 .card')
    .forEach(el=>el.onclick=()=>onHumanCardClick(el.dataset.code));

  // --- BOTS (backs only), but same fan layout ---
  const back = () => `<img src="cardBack.png" class="card" alt="Card back">`;
  bot1HandEl.innerHTML = playerHands[1].map(back).join('');
  bot2HandEl.innerHTML = playerHands[2].map(back).join('');

  // lanes
  renderLanes();
}

function renderLanes(){
  p1DisEl.innerHTML = playerDiscards[0].map(c=>`<img src="${c.image}" class="card small" alt="">`).join('');
  p2DisEl.innerHTML = playerDiscards[1].map(c=>`<img src="${c.image}" class="card small" alt="">`).join('');
  p3DisEl.innerHTML = playerDiscards[2].map(c=>`<img src="${c.image}" class="card small" alt="">`).join('');

  p1MatEl.innerHTML = playerMatches[0].map(p=>pairHTML(p)).join(' ');
  p2MatEl.innerHTML = playerMatches[1].map(p=>pairHTML(p)).join(' ');
  p3MatEl.innerHTML = playerMatches[2].map(p=>pairHTML(p)).join(' ');
}
function pairHTML(p){
  return `<span class="pair">
    <img src="${p.upcard.image}" class="card tiny" alt="">
    <span style="font-size:11px;opacity:.8">+</span>
    <img src="${p.match.image}" class="card tiny" alt="">
  </span>`;
}

// ======= End =======
function endRound(){ startBtn.disabled=false; }

// debug helper in console if needed
window._state = ()=>({playerHands, playerDiscards, playerMatches, tableCard, remainingCards, passesThisUpcard, currentPlayerIndex});
