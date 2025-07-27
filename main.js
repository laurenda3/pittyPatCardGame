let deckId = ''
let playerHand = []
let bot1Hand = []
let bot2Hand = []
let tableCard = null
let currentPlayerIndex = 0 // 0: player, 1: bot1, 2: bot2
let remainingCards = 52
let consecutivePasses = 0

const yourHandEl = document.getElementById('player1')
const bot1HandEl = document.getElementById('player2')
const bot2HandEl = document.getElementById('player3')
const tableCardEl = document.getElementById('card-zone')
const logEl = document.getElementById('status')
const startBtn = document.getElementById('playBtn')
const drawBtn = document.getElementById('drawBtn')
const deckCountEl = document.getElementById('deckCount')

startBtn.addEventListener('click', startGame)
drawBtn.addEventListener('click', drawCardManually)

drawBtn.disabled = true

function updateDeckCount() {
  deckCountEl.textContent = `Cards remaining in deck: ${remainingCards}`
}

function log(message) {
  logEl.innerText = message
}

function startGame() {
  startBtn.disabled = true
  startBtn.innerText = 'Restart Game'
  currentPlayerIndex = 0
  drawBtn.disabled = false
  consecutivePasses = 0
  fetch('https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1')
    .then(res => res.json())
    .then(data => {
      deckId = data.deck_id
      remainingCards = data.remaining
      updateDeckCount()
      dealCards()
    })
    .catch(err => console.error('Deck fetch error:', err))
}

function dealCards() {
  fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=16`)
    .then(res => res.json())
    .then(data => {
      playerHand = data.cards.slice(0, 5)
      bot1Hand = data.cards.slice(5, 10)
      bot2Hand = data.cards.slice(10, 15)
      tableCard = data.cards[15]

      remainingCards -= 16
      updateDeckCount()

      renderHands()
      renderTableCard()
      log("Your turn. Click a card to play or draw a card.")
    })
    .catch(err => console.error('Deal error:', err))
}

function renderHands() {
  yourHandEl.innerHTML = playerHand.map(card => `<img src="${card.image}" class="card" data-code="${card.code}">`).join('')
  bot1HandEl.innerHTML = bot1Hand.map(() => `<img src="cardBack.png" class="card">`).join('')
  bot2HandEl.innerHTML = bot2Hand.map(() => `<img src="cardBack.png" class="card">`).join('')

  document.querySelectorAll('#player1 .card').forEach(cardEl => {
    cardEl.addEventListener('click', () => playCard(cardEl.dataset.code))
  })
}

function renderTableCard() {
  tableCardEl.innerHTML = `<img src="${tableCard.image}" class="card">`
}

function playCard(cardCode) {
  const index = playerHand.findIndex(c => c.code === cardCode)
  if (index === -1) return

  const selectedCard = playerHand[index]
  if (selectedCard.value !== tableCard.value) {
    log("Card doesn't match the table card. You must match to play.")
    return
  }

  // Remove matched card
  playerHand.splice(index, 1)
  // Discard selected card from hand to the table
  playerHandEl.querySelector(`img[data-code="${cardCode}"]`).remove() 
    

  // Must discard another card if hand isn't empty
  if (playerHand.length > 0) {
    const discardCard = playerHand.pop()
    tableCard = discardCard
    log(`Played ${selectedCard.value}. Discarded another card.`)
  } else {
    // If no other card to discard, set table card as selectedCard
    tableCard = selectedCard
    log(`Played last matching card!`)
  }

  renderHands()
  renderTableCard()
  checkWinCondition()
  nextTurn()
}

function drawCardManually() {
  if (playerHand.length <= 5) {
    log("You cannot have more than 5 cards.")
    return
  }
  drawCardForPlayer()
}

function drawCardForPlayer() {
  fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=1`)
    .then(res => res.json())
    .then(data => {
      if (data.cards.length === 0) {
        log("No cards left to draw.")
        return
      }

      const drawn = data.cards[0]
      remainingCards = data.remaining
      updateDeckCount()

      if (playerHand.length <= 5) {
        log("You cannot have more than 5 cards.")
        return
      }

      playerHand.push(drawn)
      log(`Drew a card: ${drawn.value}`)

      renderHands()

      // Player cannot play immediately after draw, must wait for their turn
      drawBtn.disabled = true
      nextTurn()
    })
    .catch(err => console.error('Draw error:', err))
}

function checkWinCondition() {
  if (playerHand.length === 0) {
    log("You win!")
    drawBtn.disabled = true
    startBtn.disabled = false
  } else if (bot1Hand.length === 0 || bot2Hand.length === 0) {
    log("A bot wins!")
    drawBtn.disabled = true
    startBtn.disabled = false
  }
}

function nextTurn() {
  currentPlayerIndex = (currentPlayerIndex + 1) % 3

  if (currentPlayerIndex === 0) {
    // Player's turn
    drawBtn.disabled = false
    log("Your turn. Click a card to play or draw a card.")
    return
  }

  // Bot's turn
  const botHand = currentPlayerIndex === 1 ? bot1Hand : bot2Hand

  // Find match in bot's hand
  const matchIndex = botHand.findIndex(c => c.value === tableCard.value)

  if (matchIndex !== -1) {
    // Bot must discard another card if they can after matching
    const matchedCard = botHand.splice(matchIndex, 1)[0]

    if (botHand.length > 0) {
      const discardCard = botHand.pop()
      tableCard = discardCard
      log(`Bot ${currentPlayerIndex} played ${matchedCard.value} and discarded another card.`)
    } else {
      tableCard = matchedCard
      log(`Bot ${currentPlayerIndex} played their last matching card.`)
    }

    renderHands()
    renderTableCard()
    checkWinCondition()
    nextTurn()
  } else {
    // No match: bot tries to draw if possible and hand < 5
    if (remainingCards > 0 && botHand.length < 5) {
      drawCardForBot(botHand)
    } else {
      // Bot cannot draw or match, pass turn
      log(`Bot ${currentPlayerIndex} passes.`)
      consecutivePasses++
      checkStalemate()
      nextTurn()
    }
  }
}

function drawCardForBot(botHand) {
  fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=1`)
    .then(res => res.json())
    .then(data => {
      if (data.cards.length === 0) {
        log("No cards left to draw.")
        return
      }

      const drawn = data.cards[0]
      remainingCards = data.remaining
      updateDeckCount()

      if (botHand.length >= 5) {
        log(`Bot ${currentPlayerIndex} cannot hold more than 5 cards.`)
        return
      }

      botHand.push(drawn)

      // Check if drawn card matches table card
      if (drawn.value === tableCard.value) {
        const drawnIndex = botHand.findIndex(c => c.code === drawn.code)
        botHand.splice(drawnIndex, 1)

        if (botHand.length > 0) {
          const discardCard = botHand.pop()
          tableCard = discardCard
          log(`Bot ${currentPlayerIndex} drew and matched ${drawn.value} and discarded another card.`)
        } else {
          tableCard = drawn
          log(`Bot ${currentPlayerIndex} drew and played their last matching card.`)
        }

        renderHands()
        renderTableCard()
        checkWinCondition()
        consecutivePasses = 0
        nextTurn()
      } else {
        log(`Bot ${currentPlayerIndex} drew a card but no match.`)
        renderHands()
        consecutivePasses++
        checkStalemate()
        nextTurn()
      }
    })
    .catch(err => console.error('Bot draw error:', err))
}

function checkStalemate() {
  if (consecutivePasses >= 3 && remainingCards === 0) {
    log("Game ends in stalemate. No matches and no cards left.")
    drawBtn.disabled = true
    startBtn.disabled = false
  }
}
