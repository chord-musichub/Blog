(function(){
  'use strict';

  var SIZE = 4;
  var MAX_TILE_VALUE = 2048;
  var tileId = 1;

  function emptyGrid(){
    return Array.from({length:SIZE}, function(){ return Array(SIZE).fill(null); });
  }

  function vectorFor(dir){
    if(dir === 'up') return {x:0, y:-1};
    if(dir === 'down') return {x:0, y:1};
    if(dir === 'left') return {x:-1, y:0};
    return {x:1, y:0};
  }

  function traversal(dir){
    var xs = [0, 1, 2, 3];
    var ys = [0, 1, 2, 3];
    if(dir === 'right') xs.reverse();
    if(dir === 'down') ys.reverse();
    return {xs:xs, ys:ys};
  }

  function within(pos){
    return pos.x >= 0 && pos.x < SIZE && pos.y >= 0 && pos.y < SIZE;
  }

  function randomEmptyCell(grid){
    var cells = [];
    for(var y = 0; y < SIZE; y++){
      for(var x = 0; x < SIZE; x++){
        if(!grid[y][x]) cells.push({x:x, y:y});
      }
    }
    if(!cells.length) return null;
    return cells[Math.floor(Math.random() * cells.length)];
  }

  function canMove(grid){
    for(var y = 0; y < SIZE; y++){
      for(var x = 0; x < SIZE; x++){
        var tile = grid[y][x];
        if(!tile) return true;
        var right = x + 1 < SIZE ? grid[y][x + 1] : null;
        var down = y + 1 < SIZE ? grid[y + 1][x] : null;
        if((right && right.value === tile.value && tile.value < MAX_TILE_VALUE) || (down && down.value === tile.value && tile.value < MAX_TILE_VALUE)) return true;
      }
    }
    return false;
  }

  function tileClass(value){
    return 'tile-v-' + Math.min(MAX_TILE_VALUE, value);
  }

  function keyToDir(event){
    var key = event.key;
    if(key === 'ArrowUp' || key === 'w' || key === 'W') return 'up';
    if(key === 'ArrowDown' || key === 's' || key === 'S') return 'down';
    if(key === 'ArrowLeft' || key === 'a' || key === 'A') return 'left';
    if(key === 'ArrowRight' || key === 'd' || key === 'D') return 'right';
    return '';
  }

  function makeTile(value, x, y, flags){
    flags = flags || {};
    return {
      id:tileId++,
      value:value,
      x:x,
      y:y,
      isNew:!!flags.isNew,
      isMerged:!!flags.isMerged
    };
  }

  window.Songline2048Engine = {
    SIZE:SIZE,
    MAX_TILE_VALUE:MAX_TILE_VALUE,
    emptyGrid:emptyGrid,
    vectorFor:vectorFor,
    traversal:traversal,
    within:within,
    randomEmptyCell:randomEmptyCell,
    canMove:canMove,
    tileClass:tileClass,
    keyToDir:keyToDir,
    makeTile:makeTile
  };
})();