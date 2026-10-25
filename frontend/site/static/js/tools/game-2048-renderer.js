(function(){
  'use strict';

  function createRenderer(options){
    options = options || {};
    var boardEl = options.boardEl;
    var SIZE = options.size;
    var tileClass = options.tileClass;
    var tileLayer = null;
    var tileNodes = {};
    if(!boardEl || !SIZE || typeof tileClass !== 'function' || typeof options.getTiles !== 'function') return null;
    function buildShell(){
      boardEl.innerHTML = '';
      boardEl.style.setProperty('--game-2048-size', String(SIZE));

      var cells = document.createElement('div');
      cells.className = 'game-2048-cells';
      for(var i = 0; i < SIZE * SIZE; i++){
        var cell = document.createElement('div');
        cell.className = 'game-2048-cell';
        cells.appendChild(cell);
      }

      tileLayer = document.createElement('div');
      tileLayer.className = 'game-2048-tile-layer';

      boardEl.appendChild(cells);
      boardEl.appendChild(tileLayer);
      tileNodes = {};
    }

    function metrics(){
      var style = window.getComputedStyle(boardEl);
      var gap = parseFloat(style.getPropertyValue('--game-2048-gap')) || 10;
      var width = boardEl.clientWidth || 520;
      var inner = Math.max(0, width - gap * (SIZE + 1));
      var cell = inner / SIZE;
      return {gap:gap, cell:cell};
    }

    function pixelFor(tile){
      var m = metrics();
      return {
        x:m.gap + tile.x * (m.cell + m.gap),
        y:m.gap + tile.y * (m.cell + m.gap),
        size:m.cell
      };
    }

    function placeNode(node, tile, immediate){
      var p = pixelFor(tile);
      node.style.setProperty('width', p.size + 'px', 'important');
      node.style.setProperty('height', p.size + 'px', 'important');

      if(immediate){
        node.classList.add('no-transition');
      }

      node.style.transform = 'translate3d(' + p.x + 'px,' + p.y + 'px,0)';

      if(immediate){
        void node.offsetWidth;
        node.classList.remove('no-transition');
      }
    }

    function createNode(tile){
      var node = document.createElement('div');
      node.className = 'game-2048-tile';
      node.dataset.tileId = String(tile.id);
      node.innerHTML = '<span class="game-2048-tile-inner"></span>';
      tileLayer.appendChild(node);
      return node;
    }

    function syncNode(node, tile){
      node.className = 'game-2048-tile ' + tileClass(tile.value);
      if(tile.isNew) node.classList.add('is-new');
      if(tile.isMerged) node.classList.add('is-merged');
      node.querySelector('span').textContent = String(tile.value);
    }

    function renderTiles(list, options){
      options = options || {};
      var keep = {};

      list.forEach(function(tile){
        keep[tile.id] = true;
        var node = tileNodes[tile.id];
        if(!node){
          node = createNode(tile);
          tileNodes[tile.id] = node;
          placeNode(node, tile, true);
        }
        syncNode(node, tile);
        placeNode(node, tile, !!options.immediate);
      });

      Object.keys(tileNodes).forEach(function(id){
        if(!keep[id]){
          tileNodes[id].remove();
          delete tileNodes[id];
        }
      });
    }

    function clearTransientFlags(){
      options.getTiles().forEach(function(tile){
        tile.isNew = false;
        tile.isMerged = false;
      });
    }

    function removeNodes(ids){
      ids.forEach(function(id){
        var node = tileNodes[id];
        if(node){
          node.remove();
          delete tileNodes[id];
        }
      });
    }

    return {
      buildShell: buildShell,
      renderTiles: renderTiles,
      clearTransientFlags: clearTransientFlags,
      removeNodes: removeNodes
    };
  }

  window.SonglineCreate2048Renderer = createRenderer;
})();