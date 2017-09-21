const path = require('path');
const express = require('express');
const app = express();
const expressWs = require('express-ws')(app);

const uuid = require('uuid');

app.use(express.static('dist'));
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: 'keyboard cat', resave: false, saveUninitialized: false }));

const cardDefinitions=require('./cards.json');
let id=0;
let state={
  decks: {
    planet: {
      title: 'Planet Deck',
      cards: Object.assign([], cardDefinitions.planets).map(x=>Object.assign({}, x, {id:id++})),
      discard: []
    }
  },
  cardAreas: {
    planet: {
      title: 'Unaffiliated Planets',
      cards: []
    },
    'player-one': {
      title: 'Player One',
      cards: []
    }
  }
};

app.get('/', function(request, response, next) {
  response.sendFile(path.join(__dirname + '/dist/index.html'));
});

app.get('/state', function(request, response, next) {
  response.send(JSON.stringify(state));
});

function update(obj, indexes, value) {
  console.log(obj, indexes, value);
  if(indexes.length == 0) return value;
  let index=indexes[0];

  if(!obj) {
    if(Number.isInteger(index)) obj=[];
    else obj={};
  }

  const rest=indexes.slice(1);
  if(Array.isArray(obj) && index == -1) return obj.concat([update(null, rest, value)]);

  if(typeof index == 'function') index=Object.keys(obj).find(k=>index(obj[k],k));
  if(typeof index == 'object') index=Object.keys(obj).find(k => {
    return !Object.keys(index).find(i=>(obj[k]||{})[i] != index[i]);
  });

  const u={};
  u[index]=update(obj[index], rest, value);

  return Object.assign(Array.isArray(obj) ? [] : {}, obj, u);
}

function handleAction(action) {
  switch(action.type) {
    case 'DISCARD_TO_DECK': {
      const cards=state.decks[action.deck_id].cards.concat(state.decks[action.deck_id].discard);
      const update1=update(state, ['decks', action.deck_id, 'discard'], []);
      const update2=update(update1, ['decks', action.deck_id, 'cards'], cards);
      return update2;
    }
    case 'DECK_TO_CARD_AREA': {
      const deckCards=state.decks[action.deck_id].cards;
      const areaCards=state.cardAreas[action.area_id].cards;

      if(!deckCards.length) return state;

      const update1=update(state, ['decks', action.deck_id, 'cards'], deckCards.slice(1));
      const update2=update(update1, ['cardAreas', action.area_id, 'cards'], areaCards.concat(deckCards[0]));
      return update2;
    }
    case 'CARD_AREA_TO_CARD_AREA': {
      const toAreaCards=state.cardAreas[action.to_area_id].cards;
      const fromAreaCards=state.cardAreas[action.from_area_id].cards;
      const card=fromAreaCards.find(c=>c.id==action.card_id);

      const update1=update(state, ['cardAreas', action.to_area_id, 'cards'], toAreaCards.concat([card]));
      const update2=update(update1, ['cardAreas', action.from_area_id, 'cards'], fromAreaCards.filter(x=>x.id != action.card_id))
      return update2;
    }
    case 'CARD_AREA_TO_DISCARD': {
      const card=state.cardAreas[action.area_id].cards.find(x=>x.id==action.card_id);
      const update1=update(state, ['cardAreas', action.area_id, 'cards'],
        state.cardAreas[action.area_id].cards.filter(x=>x.id != action.card_id));
      const update2=update(update1, ['decks', action.deck_id, 'discard', -1], card);
      console.log(JSON.stringify(update2));
      return update2;
    }
  }

  console.log('Invalid Update', action);
  return state;
}

app.ws('/communication', function(webSocket, request) {
  webSocket.on('message', function(serializedMessage) {
    const action = JSON.parse(serializedMessage);
    state=handleAction(action);

    expressWs.getWss().clients.forEach(function(client) {
      client.send('reload-state');
      console.log('sent');
    });
    console.log("Broadcast Message");
  });
  webSocket.send('test-connection');
});

const port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log('Running on port: ' + port);
});
