(function(){
  const tool = document.querySelector('[data-random-tool]');
  if(!tool) return;
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

    if(!Number.isFinite(min) || !Number.isFinite(max)){
      result.textContent = '?';
      setNote('请输入有效数字。', true);
      return;
    }

    min = Math.ceil(min);
    max = Math.floor(max);

    if(min > max){
      const tmp = min;
      min = max;
      max = tmp;
      minInput.value = min;
      maxInput.value = max;
    }

    const value = Math.floor(Math.random() * (max - min + 1)) + min;
    result.textContent = String(value);
    setNote('区间：' + min + ' ～ ' + max, false);
  }

  btn.addEventListener('click', generate);
  [minInput, maxInput].forEach(function(input){
    input.addEventListener('keydown', function(event){
      if(event.key === 'Enter') generate();
    });
  });
})();
