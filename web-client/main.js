require("file-loader?name=index.html!./index.html");
require("file-loader?name=main.css!./main.css");

import React from 'react';
import thunkMiddleware from 'redux-thunk';
import ReactDom from 'react-dom';
import {createStore, applyMiddleware} from 'redux'
import {Provider, connect} from 'react-redux';

function gameConnect(setup, delegate) {
  return (connect((state, props) => ({
    state:state
  }), (dispatch, props) => ({
    dispatch:dispatch
  }), (stateProps, dispatchProps, props) => Object.assign({},
    props,
    setup(stateProps.state, dispatchProps.dispatch, props)
  ))(delegate));
};

function reducer(state, action) {
  state=state || {loading: true};
  if(action.type == 'UPDATE_GAME_STATE') {
    console.log('Updating game state');
    return Object.assign({}, state, {game: action.newState, loading:false});
  } else if(action.type == 'SET_WEBSOCKET') {
    return Object.assign({}, state, {
      webSocket: action.webSocket,
      sendMessage: (message) => {
        action.webSocket.send(JSON.stringify(message));
      }
    });
  }
  console.log('Invalid Update', action);
  return state;
};

const CardArea = gameConnect((state, dispatch, props) => {
 return {
   cards: state.game.cardAreas[props.id].cards,
   handleDeck: deck_id => state.sendMessage({
     type: 'DECK_TO_CARD_AREA',
     deck_id: deck_id,
     area_id: props.id
   }),
   handleCardArea: (from_area_id, card_id) => state.sendMessage({
     type: 'CARD_AREA_TO_CARD_AREA',
     from_area_id: from_area_id,
     to_area_id: props.id,
     card_id: card_id
   }),
   title: state.game.cardAreas[props.id].title
 };
}, class extends React.Component {
  render() {
    const cards=this.props.cards || [];
    return (<div className='card-area'
        onDragOver={event => {
          event.preventDefault();
        }}
        onDrop={event => {
          const type=event.dataTransfer.getData('type');
          if(type == 'deck') {
            const deck_id=event.dataTransfer.getData('id');
            this.props.handleDeck(deck_id);
          } else if(type == 'card-in-area') {
            const from_area_id=event.dataTransfer.getData('area-id');
            if(from_area_id == this.props.id) return;
            const card_id=event.dataTransfer.getData('card-id');
            this.props.handleCardArea(from_area_id, card_id);
          }
        }}>
      <div className='card-area-title'>{this.props.title}</div>
      {cards.map(card => <div key={card.id} draggable={true} onDragStart={event => {
        event.dataTransfer.setData('type', 'card-in-area');
        event.dataTransfer.setData('card-id', card.id);
        event.dataTransfer.setData('area-id', this.props.id);
      }}>
        <Card card={card} />
      </div>)}
    </div>);
  }
});

class Card extends React.Component {
  render() {
    return (<div className='card'>
      <div className='card-title'>{this.props.card.title}</div>
    </div>);
  }
};

const Deck = gameConnect((state, dispatch, props) => {
  console.log(state);
  return {
    cards: state.game.decks[props.id].cards,
    discard: state.game.decks[props.id].discard,
    deck: {
      title: state.game.decks[props.id].title
    },
    handleCardArea: (area_id, card_id) => state.sendMessage({
      type: 'CARD_AREA_TO_DISCARD',
      area_id: area_id,
      card_id: card_id,
      deck_id: props.id
    }),
    moveDiscardToDeck: () => state.sendMessage({
      type: 'DISCARD_TO_DECK',
      deck_id: props.id
    })
  };
}, class extends React.Component {
  render() {
    return (<div className='deck-and-discard'>
      <div className='deck'>
        <div className='deck-card'
          draggable={this.props.cards.length>0}
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            const type=event.dataTransfer.getData('type');
            if(type == 'deck-discard') {
              const deck_id=event.dataTransfer.getData('deck_id');
              if(deck_id != this.props.id) return;
              this.props.moveDiscardToDeck();
            }
          }}
          onDragStart={event => {
            event.dataTransfer.setData('type', 'deck');
            event.dataTransfer.setData('id', this.props.id);
            event.dataTransfer.effectAllowed = 'move';
          }}/>
        <div className='deck-title'>{this.props.deck.title} [{this.props.cards.length}]</div>
      </div>
      <div className='discard deck' draggable={true} onDragOver={event => event.preventDefault()}
        onDragStart={event => {
          event.dataTransfer.setData('type','deck-discard');
          event.dataTransfer.setData('deck_id',this.props.id);
        }}
        onDrop={event => {
          const type=event.dataTransfer.getData('type');
          if(type == 'card-in-area') {
            const from_area_id=event.dataTransfer.getData('area-id');
            const card_id=event.dataTransfer.getData('card-id');
            this.props.handleCardArea(from_area_id, card_id);
          }
        }}>
        {(this.props.discard||[]).length ?
          <Card card={this.props.discard[this.props.discard.length-1]}/> :
          <div className='discard-no-card'>Empty</div>}
        <div className='deck-title'>Discard [{(this.props.discard||[]).length}]</div>
      </div>
    </div>);
  }
});

function getGameState() {
  return dispatch => {
    console.log('getting game state')
    const request = new XMLHttpRequest();
    request.open("GET", '/state', true);
    request.onload = e => {
      console.log('loaded')
      dispatch({
        type: 'UPDATE_GAME_STATE',
        newState: JSON.parse(request.responseText)
      });
    };
    request.onerror = e => {
      alert(e);
    };
    request.send();
  };
}

const BoardGameTest = gameConnect((state, dispatch, props) => {
  console.log(JSON.stringify(state));
  return {
    loading: state.loading || !state.webSocket || !state.game,
    setWebsocket: webSocket => {
      dispatch({
        type: 'SET_WEBSOCKET',
        webSocket: webSocket
      });
    },
    getGameState: () => dispatch(getGameState())
  };
}, class extends React.Component {
  constructor(props) {
    super(props);
    const wsprotocol = location.protocol == 'https:' ? "wss" : "ws";
    const host = location.host;
    let webSocket;
    const setupWebsocket = () => {
      webSocket = new WebSocket( wsprotocol + '://' + host + "/communication");
      console.log(webSocket);

      webSocket.onopen = () => this.props.setWebsocket(webSocket);

      webSocket.onmessage = (event) => {
        console.log('Got a message');
        this.props.getGameState();
      };

      webSocket.onclose = (event) => {
        console.log('Reloading websocket');
        setTimeout(setupWebsocket, 100);
      };
    };

    setupWebsocket();
  }

  render() {
    if(this.props.loading) {
      return <div> Loading </div>;
    }

    return <div>
      <Deck id='planet' />
      <CardArea id='planet' />
      <CardArea id='player-one' />
    </div>;
  }
});
const stateStore=createStore(reducer, applyMiddleware(thunkMiddleware));
stateStore.dispatch(getGameState());

ReactDom.render(<Provider store={stateStore}>
  <BoardGameTest />
</Provider>, document.getElementById('content'));
