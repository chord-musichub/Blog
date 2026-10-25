(function(){
  function init(root){
  const tool = (root || document).querySelector('[data-random-tool]');
  if(!tool || tool.dataset.randomBound === '1') return;
  tool.dataset.randomBound = '1';
  const minInput = tool.querySelector('[data-random-min]');
  const maxInput = tool.querySelector('[data-random-max]');
  const btn = tool.querySelector('[data-random-generate]');
  const result = tool.querySelector('[data-random-result]');
  const note = tool.querySelector('[data-random-note]');

  function setNote(text, isError){
    note.textContent = text;
    note.classList.toggle('error-note', !!isError);
  }

  function generate(){
    let min = Number(minInput.value);
    let max = Number(maxInput.value);

    if(!minInput.value.trim() || !maxInput.value.trim() || !Number.isFinite(min) || !Number.isFinite(max)){
      result.textContent = '?';
      setNote('请输入有效数字。', true);
      return;
    }

    if(min > max){
      const tmp = min;
      min = max;
      max = tmp;
      minInput.value = min;
      maxInput.value = max;
    }

    min = Math.ceil(min);
    max = Math.floor(max);
    if(min > max){
      result.textContent = '?';
      setNote('这个区间没有整数，请调整范围。', true);
      return;
    }
    if(!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || !Number.isSafeInteger(max - min + 1)){
      result.textContent = '?';
      setNote('范围过大，请使用可精确表示的整数区间。', true);
      return;
    }

    const value = Math.floor(Math.random() * (max - min + 1)) + min;
    result.textContent = String(value);
    setNote('区间：' + min + ' ～ ' + max, false);
  }

  btn.addEventListener('click', generate);
  [minInput, maxInput].forEach(function(input){
    input.addEventListener('keydown', function(event){
      if(event.key === 'Enter' && !event.isComposing && event.keyCode !== 229){ event.preventDefault(); generate(); }
    });
  });
  }
  window.SonglineInitRandomNumber = init;
})();
