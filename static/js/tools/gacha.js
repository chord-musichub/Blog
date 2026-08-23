(function(){
  const tool = document.querySelector('[data-gacha-tool]');
  if(!tool) return;

  const modes = {
    starRailLike: {
      name: '原神 / 星穹铁道角色池',
      topName: '五星',
      midName: '四星',
      lowName: '三星',
      topBase: 0.006,
      midBase: 0.051,
      hardPity: 90,
      softPityStart: 74,
      softPityStep: 0.06,
      upRate: 0.5,
      guarantee: true,
      sparkTarget: null,
      tenGuaranteeMid: true,
      rules: [
        '最高稀有基础概率约 0.6%。',
        '接近 90 抽时概率逐步提升，90 抽必出最高稀有。',
        '限定 / UP 池中最高稀有有 50% 概率为 UP；歪了以后下次最高稀有必定 UP。',
        '这里只显示稀有度与是否 UP，不显示具体角色名。'
      ]
    },
    wutheringLike: {
      name: '鸣潮角色池',
      topName: '五星',
      midName: '四星',
      lowName: '三星',
      topBase: 0.008,
      midBase: 0.06,
      hardPity: 80,
      softPityStart: 66,
      softPityStep: 0.075,
      upRate: 0.5,
      guarantee: true,
      sparkTarget: null,
      tenGuaranteeMid: true,
      rules: [
        '最高稀有基础概率约 0.8%。',
        '80 抽必出最高稀有，后段概率会明显提高。',
        'UP 池采用 50% 命中 UP 与歪后下次必定 UP 的形式。',
        '常驻池不计算 UP 大小保底。'
      ]
    },
    arknightsLike: {
      name: '明日方舟标准寻访',
      topName: '六星',
      midName: '五星',
      lowName: '四星及以下',
      topBase: 0.02,
      midBase: 0.08,
      hardPity: null,
      softPityStart: 51,
      softPityStep: 0.02,
      upRate: 0.5,
      guarantee: false,
      sparkTarget: null,
      tenGuaranteeMid: true,
      rules: [
        '最高稀有基础概率约 2%。',
        '连续未出最高稀有时，从第 51 抽开始，每抽提升约 2% 最高稀有概率。',
        '这里模拟 UP 概率，但不设置歪后必定 UP 的大保底。',
        '十连内会尽量保留中稀有保底体验。'
      ]
    },
    blueArchiveLike: {
      name: '蔚蓝档案招募',
      topName: '三星',
      midName: '二星',
      lowName: '一星',
      topBase: 0.03,
      midBase: 0.185,
      hardPity: null,
      softPityStart: null,
      softPityStep: 0,
      upRate: 0.007 / 0.03,
      guarantee: false,
      sparkTarget: 200,
      tenGuaranteeMid: true,
      rules: [
        '最高稀有总概率约 3%。',
        'UP 最高稀有概率按最高稀有内部权重模拟。',
        '没有硬保底，但 200 抽可视为兑换井进度。',
        '这里只模拟抽出稀有度与是否 UP，不出现具体角色名。'
      ]
    }
  };

  const els = {
    mode: tool.querySelector('[data-gacha-mode]'),
    banner: tool.querySelector('[data-gacha-banner]'),
    modeName: tool.querySelector('[data-gacha-mode-name]'),
    bannerName: tool.querySelector('[data-gacha-banner-name]'),
    bannerNote: tool.querySelector('[data-gacha-banner-note]'),
    total: tool.querySelector('[data-gacha-total]'),
    pity: tool.querySelector('[data-gacha-pity]'),
    hardPity: tool.querySelector('[data-gacha-hard-pity]'),
    pityBar: tool.querySelector('[data-gacha-pity-bar]'),
    guarantee: tool.querySelector('[data-gacha-guarantee]'),
    guaranteeNote: tool.querySelector('[data-gacha-guarantee-note]'),
    spark: tool.querySelector('[data-gacha-spark]'),
    sparkTarget: tool.querySelector('[data-gacha-spark-target]'),
    sparkBar: tool.querySelector('[data-gacha-spark-bar]'),
    results: tool.querySelector('[data-gacha-results]'),
    summary: tool.querySelector('[data-gacha-summary]'),
    rules: tool.querySelector('[data-gacha-rules]')
  };

  let state = {
    pity: 0,
    midPity: 0,
    total: 0,
    guaranteeNext: false,
    spark: 0,
    history: []
  };

  function currentMode(){
    return modes[els.mode.value] || modes.starRailLike;
  }

  function isFeatured(){
    return els.banner.value === 'featured';
  }

  function topChance(mode){
    if(mode.hardPity && state.pity + 1 >= mode.hardPity) return 1;
    if(mode.softPityStart && state.pity + 1 >= mode.softPityStart){
      const extra = (state.pity + 1 - mode.softPityStart + 1) * mode.softPityStep;
      return Math.min(1, mode.topBase + extra);
    }
    return mode.topBase;
  }

  function pullOne(forceMid){
    const mode = currentMode();
    state.total += 1;
    state.pity += 1;
    state.midPity += 1;
    state.spark += 1;

    const topRate = topChance(mode);
    let rarity = 'low';
    let isUp = false;
    let note = '';

    if(Math.random() < topRate){
      rarity = 'top';
      state.pity = 0;
      state.midPity = 0;

      if(isFeatured()){
        if(mode.guarantee && state.guaranteeNext){
          isUp = true;
          state.guaranteeNext = false;
          note = '大保底命中 UP';
        }else{
          isUp = Math.random() < mode.upRate;
          if(mode.guarantee){
            state.guaranteeNext = !isUp;
            note = isUp ? '小保底命中 UP' : '小保底歪了，下次必定 UP';
          }else{
            note = isUp ? '命中 UP' : '非 UP 最高稀有';
          }
        }
      }else{
        note = '常驻最高稀有 · 无 UP 判定';
        state.guaranteeNext = false;
      }
    }else{
      const midRate = mode.midBase;
      if(forceMid || Math.random() < midRate){
        rarity = 'mid';
        state.midPity = 0;
        note = '中稀有';
      }else{
        note = '普通';
      }
    }

    if(mode.sparkTarget && state.spark >= mode.sparkTarget){
      note += ' · 兑换井已满';
    }

    return {
      rarity,
      label: rarity === 'top' ? mode.topName : (rarity === 'mid' ? mode.midName : mode.lowName),
      up: isUp,
      note,
      index: state.total
    };
  }

  function pull(count){
    const batch = [];
    for(let i = 0; i < count; i++){
      const mode = currentMode();
      const isLastOfTen = count === 10 && i === 9;
      const forceMid = mode.tenGuaranteeMid && isLastOfTen && state.midPity >= 9;
      batch.push(pullOne(forceMid));
    }
    state.history = batch.concat(state.history).slice(0, 80);
    render(batch);
  }

  function reset(){
    state = {
      pity: 0,
      midPity: 0,
      total: 0,
      guaranteeNext: false,
      spark: 0,
      history: []
    };
    render([]);
  }

  function render(lastBatch){
    const mode = currentMode();
    tool.classList.toggle('is-standard-banner', !isFeatured());
    els.modeName.textContent = mode.name;
    els.bannerName.textContent = isFeatured() ? '限定 / UP' : '常驻';
    els.bannerNote.textContent = isFeatured()
      ? '当前为限定 / UP 池：抽到最高稀有后会判定是否为 UP，并根据规则处理小保底 / 大保底。'
      : '当前为常驻池：只模拟稀有度与保底抽数，不判定 UP，也不会触发大小保底。';
    els.total.textContent = String(state.total);
    els.pity.textContent = String(state.pity);
    els.hardPity.textContent = mode.hardPity ? String(mode.hardPity) : '递增';
    const pityDenom = mode.hardPity || Math.max(80, mode.softPityStart || 80);
    els.pityBar.style.width = Math.min(100, state.pity / pityDenom * 100) + '%';

    if(!isFeatured()){
      els.guarantee.textContent = '常驻池';
      els.guaranteeNote.textContent = '常驻池不计算 UP 大小保底。';
    }else if(mode.guarantee){
      els.guarantee.textContent = state.guaranteeNext ? '大保底' : '小保底';
      els.guaranteeNote.textContent = state.guaranteeNext ? '下次最高稀有必定为 UP。' : '下次最高稀有有概率为 UP。';
    }else{
      els.guarantee.textContent = '无大保底';
      els.guaranteeNote.textContent = '该机制只模拟 UP 概率，不设置歪后必定 UP。';
    }

    els.spark.textContent = String(state.spark);
    els.sparkTarget.textContent = mode.sparkTarget ? String(mode.sparkTarget) : '—';
    els.sparkBar.style.width = mode.sparkTarget ? Math.min(100, state.spark / mode.sparkTarget * 100) + '%' : '0%';

    const bannerRule = isFeatured()
      ? '当前选择的是限定 / UP 池：会显示 UP 标签，并按该游戏规则处理大小保底。'
      : '当前选择的是常驻池：不会显示 UP 标签，也不会累积或触发大保底。';
    els.rules.innerHTML = '<ul>' + mode.rules.concat([bannerRule]).map(function(rule){ return '<li>' + rule + '</li>'; }).join('') + '</ul>';

    if(lastBatch && lastBatch.length){
      const tops = lastBatch.filter(x => x.rarity === 'top').length;
      const ups = lastBatch.filter(x => x.up).length;
      els.summary.textContent = isFeatured()
        ? '本次 ' + lastBatch.length + ' 抽：最高稀有 ' + tops + ' 个，UP ' + ups + ' 个。'
        : '本次 ' + lastBatch.length + ' 抽：最高稀有 ' + tops + ' 个。常驻池不判定 UP。';
    }else{
      els.summary.textContent = state.total ? '已重置本页显示。' : '选择机制后开始抽卡。';
    }

    if(!state.history.length){
      els.results.innerHTML = '<div class="gacha-empty">还没有抽卡记录。</div>';
      return;
    }

    els.results.innerHTML = state.history.map(function(item){
      const cls = item.rarity === 'top' ? 'top' : (item.rarity === 'mid' ? 'mid' : 'low');
      const up = item.up ? '<span class="gacha-up">UP</span>' : '';
      return '<div class="gacha-card ' + cls + '">' +
        '<span class="gacha-rarity">' + item.label + '</span>' +
        up +
        '<small>#' + item.index + ' · ' + item.note + '</small>' +
      '</div>';
    }).join('');
  }

  tool.querySelector('[data-gacha-pull-one]').addEventListener('click', function(){ pull(1); });
  tool.querySelector('[data-gacha-pull-ten]').addEventListener('click', function(){ pull(10); });
  tool.querySelector('[data-gacha-reset]').addEventListener('click', reset);
  els.mode.addEventListener('change', reset);
  els.banner.addEventListener('change', reset);

  render([]);
})();
