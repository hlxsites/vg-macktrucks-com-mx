import {
  button, a, div, domEl, p,
} from '../../scripts/scripts.js';
import { loadScript } from '../../scripts/lib-franklin.js';

/**
 * as multiple blocks might be on the same page, the data is accessed using they block node as the
 * key.
 *
 * @type {Map<HTMLElement, Record<string, CategoryData>>}>}
 */
const engineData = new Map();

/**
 * @typedef {Object} EngineDetail
 * @property {Array<Array<string>>} facts
 * @property {Array<Array<string>>} performanceData
 */

export default async function decorate(block) {
  engineData.set(block, {});

  // load categories and data
  const rawCategories = [...block.children];
  rawCategories.forEach((rawTabHeader) => {
    const categoryId = rawTabHeader.children[0].textContent.replaceAll('®', '').toLowerCase().trim();
    engineData.get(block)[categoryId] = {
      nameHTML: rawTabHeader.children[0].innerHTML,
      descriptionHTML: rawTabHeader.children[1].innerHTML,
      engines: {},
    };
  });
  rawCategories.forEach((node) => node.remove());
  loadPerformanceDataFromDataBlocks(block);

  const initialCategoryId = Object.keys(engineData.get(block))[0];
  const initialEngineId = Object.keys(engineData.get(block)[initialCategoryId].engines)[0];

  // add tabs
  block.append(renderCategoryTabs(block, engineData.get(block), initialCategoryId));

  // add category details and engine selection ("XY HP")
  block.append(
    renderCategoryDetail(block, engineData.get(block)[initialCategoryId], initialEngineId),
  );

  // Add detail panel with facts and chart
  const engineDetails = engineData.get(block)[initialCategoryId].engines[initialEngineId];
  const detailPanel = div({ class: 'details-panel' },
    renderEngineSpecs(engineDetails),
    div({ class: 'performance-chart' },
      div({ class: 'loading-spinner' }),
    ));
  block.append(detailPanel);

  const chartContainer = block.querySelector('.performance-chart');
  // noinspection JSIgnoredPromiseFromCall,ES6MissingAwait
  updateChart(chartContainer, engineDetails.performanceData);
}

/**
 * @typedef {Object} CategoryData
 * @property {string} nameHTML
 * @property {string} descriptionHTML
 * @property {Object.<string, EngineDetail>} engines
 */

function renderCategoryTabs(block, categoryData, categoryId) {
  const tabList = div({ role: 'tablist', class: 'category-tablist' });
  Object.keys(categoryData)
    .forEach((aCategoryId) => {
      const { nameHTML } = categoryData[aCategoryId];
      const tabButton = button({
        class: 'tab',
        role: 'tab',
        'aria-selected': aCategoryId === categoryId,
        'data-category-id': aCategoryId,
      });
      tabButton.innerHTML = nameHTML;

      tabButton.addEventListener('click', () => {
        if (tabButton.getAttribute('aria-selected') === 'true') {
          // ignore click if already selected
          return;
        }
        // Remove all current selected tabs and set this tab as selected
        tabList.querySelectorAll('[aria-selected="true"]')
          .forEach((tab) => tab.setAttribute('aria-selected', false));
        tabButton.setAttribute('aria-selected', true);

        block.querySelector('.category-detail').replaceWith(
          renderCategoryDetail(block, engineData.get(block)[tabButton.dataset.categoryId]),
        );

        refreshDetailView(block);
      });
      tabList.append(tabButton);
    });
  handleKeyboardNavigation(tabList);
  return tabList;
}

function renderCategoryDetail(block, categoryData, selectEngineId = null) {
  const categoryDetails = div({ class: 'category-detail' });
  categoryDetails.innerHTML = `
    <h3>${categoryData.nameHTML}</h3>
    <p class="category-description">${categoryData.descriptionHTML}</p>
    <div class="engine-navigation">
      <p class="engine-ratings">Engine Ratings</p>
      <div class="engine-tablist" role="tablist" aria-label="Engine Ratings"> </div>
    </div>`;

  const tabList = categoryDetails.querySelector('.engine-tablist');
  handleKeyboardNavigation(tabList);

  Object.keys(categoryData.engines).forEach((engineId, index) => {
    let isSelected;
    if (selectEngineId) {
      isSelected = engineId === selectEngineId;
    } else {
      isSelected = index === 0;
    }

    const engineButton = button({ role: 'tab', 'aria-selected': isSelected }, engineId);

    engineButton.addEventListener('click', () => {
      // ignore click if already selected
      if (engineButton.getAttribute('aria-selected') === 'true') {
        return;
      }

      // Remove selection from currently selected tabs and set this tab as selected
      tabList.querySelectorAll('[aria-selected="true"]')
        .forEach((tab) => tab.setAttribute('aria-selected', false));
      engineButton.setAttribute('aria-selected', true);

      refreshDetailView(block);
    });
    tabList.append(engineButton);
  });

  return categoryDetails;
}

function renderEngineSpecs(engineDetails) {
  const { facts } = engineDetails;

  // noinspection JSCheckFunctionSignatures
  return div({ class: 'key-specs' },
    domEl('dl', {}, ...facts.map((cells) => [
      domEl('dt', cells[0]),
      domEl('dd', cells[1]),
    ])
      .flat()),
    p({ class: 'button-container' },
      a({ class: 'button secondary download-specs' }, 'Download Specs')),
  );
}

function refreshDetailView(block) {
  const { categoryId } = block.querySelector('.category-tablist button[aria-selected="true"]').dataset;
  const engineId = block.querySelector('.engine-tablist button[aria-selected="true"]').textContent;
  const engineDetails = engineData.get(block)[categoryId].engines[engineId];

  // replace key specs
  block.querySelector('.key-specs').replaceWith(renderEngineSpecs(engineDetails));

  // update chart
  const chartContainer = block.querySelector('.performance-chart');
  // noinspection JSIgnoredPromiseFromCall
  updateChart(chartContainer, engineDetails.performanceData);
}

function handleKeyboardNavigation(tabList) {
  // from https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/tab_role
  tabList.addEventListener('keydown', (e) => {
    const tabs = [...tabList.children];
    let tabFocus = tabs.indexOf(e.target);

    // Move right
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      tabs[tabFocus].setAttribute('tabindex', -1);
      if (e.key === 'ArrowRight') {
        // eslint-disable-next-line no-plusplus
        tabFocus++;
        // If we're at the end, go to the start
        if (tabFocus >= tabs.length) {
          tabFocus = 0;
        }
        // Move left
      } else if (e.key === 'ArrowLeft') {
        // eslint-disable-next-line no-plusplus
        tabFocus--;
        // If we're at the start, move to the end
        if (tabFocus < 0) {
          tabFocus = tabs.length - 1;
        }
      }

      tabs[tabFocus].setAttribute('tabindex', 0);
      tabs[tabFocus].focus();
    }
  });
}

/**
 * @param chartContainer {HTMLElement}
 * @param performanceData {Array<Array<string>>}
 */
async function updateChart(chartContainer, performanceData) {
  if (!window.echarts) {
    // custom small bundle created on https://echarts.apache.org/en/builder.html
    await loadScript('../../common/echarts-5.4.2/echarts.custom.only-linecharts.min.js');
  }

  let myChart = window.echarts.getInstanceByDom(chartContainer);
  if (!myChart) {
    myChart = window.echarts.init(chartContainer, 'dark');
    window.addEventListener('resize', () => {
      if (!myChart.isDisposed()) {
        myChart.resize();
      }
    });
  }

  // cast RPM column to numbers
  performanceData.forEach((row) => {
    row[0] = Number(row[0]);
  });

  function getEchartsSeries(sweetSpotStart, sweetSpotEnd) {
    const series = [];

    performanceData[0].slice(1)
      .forEach((title, index) => series.push({
        type: 'line',
        name: title,
        seriesLayoutBy: 'column',
        data: performanceData.slice(1)
          .map((row) => [row[0], row[index + 1]]),
      }));

    // add mark area to first series
    series[0] = {
      ...series[0],
      markArea: {
        silent: true,
        itemStyle: {
          color: 'rgb(198 214 235 / 50%)',
        },
        data: [[{ xAxis: sweetSpotStart }, { xAxis: sweetSpotEnd }]],
      },
    };

    return series;
  }

  const option = {
    legend: {
      icon: 'circle',
      top: 'top',
    },

    series: getEchartsSeries(1300, 1700),
    // Global palette:
    color: [
      '#85764d',
      '#808285',
      '#275fa6',
      '#c23531',
      '#2f4554',
      '#61a0a8',
      '#d48265',
      '#91c7ae',
      '#749f83',
      '#ca8622',
      '#bda29a',
      '#6e7074',
      '#546570',
      '#c4ccd3',
    ],

    grid: {
      //  reduce space around the chart
      left: '50',
    },
    xAxis: {
      min: performanceData[1][0],
      max: performanceData.at(-1)[0] + 100,
      type: 'value',
      name: 'RPM',
      nameTextStyle: {
        borderType: 'solid',
        verticalAlign: 'top',
        lineHeight: 30,
        fontWeight: 'bold',
      },
      nameLocation: 'start',
      axisTick: {
        show: false,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#d3d3d3',
          width: 1,
        },
      },
      minorTick: {
        show: true,
        splitNumber: 3,
      },
      minorSplitLine: {
        show: true,
        lineStyle: {
          color: '#d3d3d3',
          width: 1,
        },
      },
      axisLabel: {
        show: true,
        interval: 0,
        showMinLabel: false,
        showMaxLabel: false,
        color: '#767676',
        fontWeight: 'bold',
      },
    },
    yAxis: {
      type: 'value',
    },
    animation: true,
    animationDuration: 400,
  };
  myChart.setOption(option, {
    // https://github.com/apache/echarts/issues/6202
    notMerge: true,
  });
}

function loadPerformanceDataFromDataBlocks(block) {
  block.closest('.performance-specifications-container').querySelectorAll('.performance-data')
    .forEach((dataBlock) => {
      const tableData = deconstructBlockIntoArray(dataBlock)
        .filter((cols) => cols.length > 0 && cols[0] !== '');
      const indexOfRpm = tableData.findIndex((row) => row[0] === 'RPM');
      // rows until RPM are facts, after is performance data
      const facts = tableData.slice(0, indexOfRpm);
      const performanceData = tableData.slice(indexOfRpm);

      const categoryKey = [...dataBlock.classList].find((c) => c !== 'performance-data' && !c.toLowerCase()
        .endsWith('-hp') && c !== 'block');
      const horsepower = [...dataBlock.classList].find((c) => c.toLowerCase()
        .endsWith('-hp'))
        .replace('-', ' ')
        .toUpperCase();

      if (!engineData.get(block)[categoryKey]) {
        engineData.get(block)[categoryKey] = {};
      }
      engineData.get(block)[categoryKey].engines[horsepower] = {
        facts,
        performanceData,
      };
    });
}

/**
 *  inverse operation of `buildBlock()`.
 *
 * @param blockEl {HTMLDivElement} Franklin row column tree
 * @return {string[][]} 2d array of the block's content
 */
export function deconstructBlockIntoArray(blockEl) {
  const array2d = [];
  Array.from(blockEl.children)
    .forEach((rowEl) => {
      const row = [];
      Array.from(rowEl.children)
        .forEach((colEl) => {
          if (colEl.childNodes.length <= 1) {
            row.push(colEl.textContent);
          } else {
            const col = [];
            Array.from(colEl.childNodes)
              .forEach((val) => {
                col.push(val.textContent);
              });
            row.push(col);
          }
        });

      array2d.push(row);
    });

  return array2d;
}
