import "index.html";
import "style.css";
import "favicon.ico";
import io from "socket.io-client";
import { csv } from "d3-request";
import { utcFormat } from "d3-time-format";

//-- dimensions
const width = 800;
const height = 600;
const margin = { top: 30, right: 80, bottom: 30, left: 20 },
  innerWidth = width - margin.left - margin.right,
  innerHeight = height - margin.top - margin.bottom;

//-- HTML elements
const contentDiv = document.getElementById("content");
let chartDiv1, chartDiv2;
let chartHolder1, chartHolder2;
let indicationHolder1, indicationHolder2;
let tickerSelection;

//-- time related
const formatTime = utcFormat("%H:%M");

//-- chart related
const tickers = ["AAPL", "GOOGL", "FB", "MSFT"];
const colors = ["#1f77b4", "#9467bd", "#ff7f02", "#8c564b"];
const upColor = "#2ca02c";
const downColor = "#d62728";
let pChart = {};
let cChart = {};

//-- data
let dataByTicker; //map
let dataArr = []; //array

//-- load historical data
const col = (d) => {
  d.price = +d.price; //string to number
  d.priceChange = 0; //initial value set to 0
  d.percentChange = 0; //initial value set to 0
  return d;
};
csv("/market-history", col, (error, data) => {
  if (error) {
    contentDiv.textContent = error.target.response;
    return;
  }
  contentDiv.textContent = "";
  dataByTicker = d3.group(data, (d) => d.ticker);
  tickers.map((currTicker) => {
    let dataArr = dataByTicker.get(currTicker);
    const firstPrice = dataArr[0].price;

    dataArr.forEach((item) => {
      item.priceChange = Math.round((item.price - firstPrice) * 100) / 100;
      item.percentChange =
        Math.round(((item.price - firstPrice) / firstPrice) * 10000) / 100;
    });
  });
  // console.log("data loaded :: dataByTicker?? after ", dataByTicker);

  pChart = priceChart();
  // cChart = changeChart();
});

//-- subscribe to updates
const socket = io();
socket.on("market events", function (data) {
  console.log("Change", data);
  /*
  0: {timestamp: '1638869400000', ticker: 'AAPL', price: 126.62449999999983}
  {timestamp: 1638883200000, changes: Array(3)}
    changes: Array(3)
      0: {ticker: 'AAPL', change: -0.0517}
      1: {ticker: 'GOOGL', change: -0.2755}
      2: {ticker: 'MSFT', change: 0.0393}
    timestamp: 1638883200000
  */
  if (data.changes.length > 0) {
    const timestamp = data.timestamp + "";
    const changesArr = data.changes;
    tickers.map((currTicker) => {
      let dataArr = dataByTicker.get(currTicker);
      const firstPrice = dataArr[0].price;
      let lastPrice =
        dataArr.length > 0 ? dataArr[dataArr.length - 1].price : 0;
      let newDataObj = data.changes.find(({ ticker }) => ticker === currTicker);
      lastPrice = newDataObj ? lastPrice + newDataObj.change : lastPrice;
      const price = newDataObj ? lastPrice + newDataObj.change : lastPrice;
      const priceChange = Math.round((lastPrice - firstPrice) * 100) / 100;
      const percentChange =
        Math.round(((lastPrice - firstPrice) / firstPrice) * 10000) / 100;
      dataArr.push({
        timestamp: timestamp,
        ticker: currTicker,
        price: price,
        priceChange: priceChange,
        percentChange: percentChange,
      });
    });
    // console.log("dataByTicker", dataByTicker);

    // pChart.update();
    // cChart.update();
  }
});
socket.on("start new day", function (data) {
  console.log("\nNewDay", data);
  /*
    {
      "timestamp": 1489483800000,
      "newDay": true
    }
  */
  //-- reset dataByTicker;
  tickers.map((currTicker) => {
    let dataArr = dataByTicker.get(currTicker);
    dataArr.length = 0;
  });
  // console.log("NewDay :: dataByTicker??? ", dataByTicker);
});

function changeChart() {
  let changeChart = {};

  chartDiv2 = contentDiv.appendChild(document.createElement("div"));
  chartDiv2.setAttribute("id", "chartDiv2");
  chartDiv2.setAttribute("class", "chartDiv");
  chartDiv2.innerHTML = `
    <div class="chartHolder" id="chartHolder2"></div>
    <div class="indicationHolder" id="indicationHolder2"></div>
  `;
  chartHolder2 = document.getElementById("chartHolder2");
  indicationHolder2 = document.getElementById("indicationHolder2");
  indicationHolder2.innerHTML = tickers
    .map(
      (ticker) => `<div class="infoHolder">
          <div class="ticker-info">
            <div class="block"></div>
            <div class="category">
                <div class="ticker">${ticker}</div>
                <div class="price">$123.67</div>
            </div>
          </div>
          <div class="change-info">
            <div class="percent">+0.86<span>%</span></div>
            <div class="value">+$1.05</div>
          </div>
      </div>`
    )
    .join("");

  let dataArr;
  let infoHolders = chartDiv2.querySelectorAll(".infoHolder");
  let tickerInfos = chartDiv2.querySelectorAll(".ticker-info");
  let tickerBlocks = chartDiv2.querySelectorAll(".ticker-info .block");
  let prices = chartDiv2.querySelectorAll(".ticker-info .category .price");

  updateInfo();

  function updateInfo() {
    dataArr = tickers.map((ticker) => dataByTicker.get(ticker));
    const lastIndex = dataArr[0].length - 1;
    //-- for each ticker
    tickers.map((ticker, i) => {
      infoHolders[i].style.top = 60 * i + "px";
      tickerInfos[i].style.color = tickerBlocks[i].style.backgroundColor =
        colors[i];
      prices[i].textContent =
        "$" + Math.round(dataArr[i][lastIndex].price * 100) / 100;
    });

    /*
    //-- calculate priceChange and percentChange
    let firstPrice = selectedData[0].price;
    let lastPrice = selectedData[lastIndex].price;
    let priceChange = Math.round((lastPrice - firstPrice) * 100) / 100;
    let percentChange = selectedData[lastIndex].percentChange;
    let sign = priceChange == 0 ? "" : "+";
    changeInfo.style.color = upColor;
    if (priceChange < 0) {
      sign = "-";
      changeInfo.style.color = downColor;
    }
    lastPrice = Math.round(lastPrice * 100) / 100;
    //
    // chartDiv1.querySelector(".ticker").textContent = selectedTicker;
    // indicationHolder1.querySelector(".price").textContent = "$" + lastPrice;
    indicationHolder1.querySelector(".percent").innerHTML = `${sign}${Math.abs(
      percentChange
    )}<span>%</span>`;
    indicationHolder1.querySelector(".value").textContent =
      sign + "$" + Math.abs(priceChange);
    */
  }

  //-----------------------------//
  //-------- init chart ---------//
  //-----------------------------//
  const svg = d3
    .select("#chartHolder1")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g");

  //   // const xValue = (d) => d["timestamp"];
  //   // const yValue = (d) => +d["price"];

  //   //-- set ranges
  //   // let xScale = d3
  //   //   .scaleUtc()
  //   //   .domain(d3.extent(selectedData, xValue))
  //   //   .range([0, innerWidth]);
  //   // let yScale = d3
  //   //   .scaleLinear()
  //   //   .domain(d3.extent(selectedData, yValue))
  //   //   .range([innerHeight, 0]);

  //   //-- set grids :: vertical xGrid and horizontal yGrid
  //   // let xGrid = (g) =>
  //   //   g
  //   //     .attr("class", "vline")
  //   //     .selectAll("line")
  //   //     .data(xScale.ticks(10))
  //   //     .join("line")
  //   //     .attr("x1", (d) => xScale(d))
  //   //     .attr("x2", (d) => xScale(d))
  //   //     .attr("y1", 0 + margin.top - 8) /* 8px extra long */
  //   //     .attr("y2", height - margin.bottom + 8); /* 8px extra long */
  //   // let yGrid = (g) =>
  //   //   g
  //   //     .attr("class", "hline")
  //   //     .selectAll("line")
  //   //     .data(yScale.ticks(5))
  //   //     .join("line")
  //   //     .attr("x1", 0)
  //   //     .attr("x2", innerWidth + 75) /* 75px extra wide */
  //   //     .attr("y1", (d) => yScale(d))
  //   //     .attr("y2", (d) => yScale(d));
  //   // let xGridG = svg
  //   //   .append("g")
  //   //   .attr("transform", `translate(${margin.left}, 0)`)
  //   //   .call(xGrid);
  //   // let yGridG = svg
  //   //   .append("g")
  //   //   .attr("transform", `translate(0, ${margin.top})`)
  //   //   .call(yGrid);

  //   //-- add X axis
  //   // let xAxisB = svg
  //   //   .append("g")
  //   //   .attr("id", "xAxisB")
  //   //   .attr("class", "xAxis")
  //   //   .attr(
  //   //     "transform",
  //   //     `translate(${margin.left}, ${height - margin.bottom + 8})`
  //   //   );
  //   // xAxisB
  //   //   .call(d3.axisBottom(xScale).ticks(10).tickFormat(formatTime))
  //   //   .call((g) => g.select(".domain").remove());
  //   // let xAxisT = svg
  //   //   .append("g")
  //   //   .attr("id", "xAxisT")
  //   //   .attr("class", "xAxis")
  //   //   .attr("transform", `translate(${margin.left}, ${margin.top - 8})`);
  //   // xAxisT
  //   //   .call(d3.axisTop(xScale).ticks(10).tickFormat(formatTime))
  //   //   .call((g) => g.select(".domain").remove());

  //   //-- add Y axis
  //   // let yAxis = svg
  //   //   .append("g")
  //   //   .attr("id", "yAxisR")
  //   //   .attr("class", "yAxis")
  //   //   .attr(
  //   //     "transform",
  //   //     `translate(${margin.left + innerWidth - 5}, ${margin.top - 10})`
  //   //   );
  //   // yAxis
  //   //   .call(d3.axisRight(yScale).ticks(5).tickFormat(d3.format(".2f")))
  //   //   .call((g) => g.select(".domain").remove());

  //   //-- draw a line
  //   // let line = svg
  //   //   .append("g")
  //   //   .attr("transform", `translate(${margin.left}, ${margin.top})`)
  //   //   .append("path")
  //   //   .datum(selectedData)
  //   //   .attr(
  //   //     "d",
  //   //     d3
  //   //       .line()
  //   //       .x((d) => xScale(d.timestamp))
  //   //       .y((d) => yScale(d.price))
  //   //   )
  //   //   .attr("stroke", selectedColor)
  //     .style("stroke-width", 2)
  //     .style("fill", "none");

  //   function updateChart() {
  //     //-- update scales
  //     // xScale = d3
  //     //   .scaleUtc()
  //     //   .domain(d3.extent(selectedData, xValue))
  //     //   .range([0, innerWidth]);
  //     // yScale = d3
  //     //   .scaleLinear()
  //     //   .domain(d3.extent(selectedData, yValue))
  //     //   .range([innerHeight, 0]);
  //     //-- update grids
  //     // xGridG.call(xGrid);
  //     // yGridG.call(yGrid);
  //     //-- update ticks
  //     // xAxisB
  //     //   .call(d3.axisBottom(xScale).ticks(10).tickFormat(formatTime))
  //     //   .call((g) => g.select(".domain").remove());
  //     // xAxisT
  //     //   .call(d3.axisTop(xScale).ticks(10).tickFormat(formatTime))
  //     //   .call((g) => g.select(".domain").remove());
  //     // yAxis
  //     //   .call(d3.axisRight(yScale).ticks(5).tickFormat(d3.format(".2f")))
  //     //   .call((g) => g.select(".domain").remove());
  //     //-- update graph line
  //     // line
  //     //   .datum(selectedData)
  //     //   .transition()
  //     //   .duration(750)
  //     //   .attr("stroke", selectedColor)
  //     //   .attr(
  //     //     "d",
  //     //     d3
  //     //       .line()
  //     //       .x((d) => xScale(d.timestamp))
  //     //       .y((d) => yScale(d.price))
  //     //   );
  //   }

  // changeChart.reset = function (data) {
  //   console.log("changeChart.reset called, data ??", data);
  // };
  changeChart.update = function () {
    console.log("changeChart.update called, data ??", data);
  };

  return changeChart;
}

function priceChart() {
  let priceChart = {};

  chartDiv1 = contentDiv.appendChild(document.createElement("div"));
  chartDiv1.setAttribute("id", "chartDiv1");
  chartDiv1.setAttribute("class", "chartDiv");
  chartDiv1.innerHTML = `
    <div class="chartHolder" id="chartHolder1"></div>
    <div class="indicationHolder" id="indicationHolder1">
        <div class="infoHolder">
            <div class="ticker-info">
              <div class="block"></div>
              <div class="category">
                  <div class="ticker">AAPL</div>
                  <div class="price">$123.67</div>
              </div>
            </div>
            <div class="change-info">
              <div class="percent">+0.86<span>%</span></div>
              <div class="value">+$1.05</div>
            </div>
        </div>
    </div>
  `;
  chartHolder1 = document.getElementById("chartHolder1");
  indicationHolder1 = document.getElementById("indicationHolder1");

  let tickerInfo = chartDiv1.querySelector(".ticker-info");
  let tickerBlock = chartDiv1.querySelector(".ticker-info .block");
  let changeInfo = chartDiv1.querySelector(".change-info");

  let selectedIndex, selectedTicker, selectedColor, selectedData;
  selectedIndex = 0;
  selectedTicker = tickers[selectedIndex];
  selectedColor = colors[selectedIndex];
  selectedData = dataByTicker.get(tickers[selectedIndex]);
  updateInfo();

  //-----------------------------//
  //-------- init chart ---------//
  //-----------------------------//
  const svg = d3
    .select("#chartHolder1")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g");

  const xValue = (d) => d["timestamp"];
  const yValue = (d) => d["price"];

  //-- set ranges
  let xScale = d3
    .scaleUtc()
    .domain(d3.extent(selectedData, xValue))
    .range([0, innerWidth]);
  let yScale = d3
    .scaleLinear()
    .domain(d3.extent(selectedData, yValue))
    .range([innerHeight, 0]);

  //-- set grids :: vertical xGrid and horizontal yGrid
  let xGrid = (g) =>
    g
      .attr("class", "vline")
      .selectAll("line")
      .data(xScale.ticks(10))
      .join("line")
      .attr("x1", (d) => xScale(d))
      .attr("x2", (d) => xScale(d))
      .attr("y1", 0 + margin.top - 8) /* 8px extra long */
      .attr("y2", height - margin.bottom + 8); /* 8px extra long */
  let yGrid = (g) =>
    g
      .attr("class", "hline")
      .selectAll("line")
      .data(yScale.ticks(5))
      .join("line")
      .attr("x1", 0)
      .attr("x2", innerWidth + 75) /* 75px extra wide */
      .attr("y1", (d) => yScale(d))
      .attr("y2", (d) => yScale(d));
  let xGridG = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(xGrid);
  let yGridG = svg
    .append("g")
    .attr("transform", `translate(0, ${margin.top})`)
    .call(yGrid);

  //-- add X axis
  let xAxisB = svg
    .append("g")
    .attr("id", "xAxisB")
    .attr("class", "xAxis")
    .attr(
      "transform",
      `translate(${margin.left}, ${height - margin.bottom + 8})`
    );
  xAxisB
    .call(d3.axisBottom(xScale).ticks(10).tickFormat(formatTime))
    .call((g) => g.select(".domain").remove());
  let xAxisT = svg
    .append("g")
    .attr("id", "xAxisT")
    .attr("class", "xAxis")
    .attr("transform", `translate(${margin.left}, ${margin.top - 8})`);
  xAxisT
    .call(d3.axisTop(xScale).ticks(10).tickFormat(formatTime))
    .call((g) => g.select(".domain").remove());

  //-- add Y axis
  let yAxis = svg
    .append("g")
    .attr("id", "yAxisR")
    .attr("class", "yAxis")
    .attr(
      "transform",
      `translate(${margin.left + innerWidth - 5}, ${margin.top - 10})`
    );
  yAxis
    .call(d3.axisRight(yScale).ticks(5).tickFormat(d3.format(".2f")))
    .call((g) => g.select(".domain").remove());

  //-- draw a line
  let line = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`)
    .append("path")
    .datum(selectedData)
    .attr(
      "d",
      d3
        .line()
        .x((d) => xScale(d.timestamp))
        .y((d) => yScale(d.price))
    )
    .attr("stroke", selectedColor)
    .style("stroke-width", 2)
    .style("fill", "none");

  //-- build ticker select drop-down
  tickerSelection = chartDiv1.appendChild(document.createElement("select"));
  tickerSelection.setAttribute("id", "tickerSelection");
  d3.select("#tickerSelection")
    .selectAll("myOptions")
    .data(tickers)
    .enter()
    .append("option")
    .text((d) => d)
    .attr("value", (d) => d);

  //-- on tickerSelection change, update chart
  d3.select("#tickerSelection").on("change", (e) => {
    selectedIndex = e.target.selectedIndex;
    selectedTicker = tickers[selectedIndex];
    selectedColor = colors[selectedIndex];
    selectedData = dataByTicker.get(tickers[selectedIndex]);
    updateInfo();
    updateChart();
  });

  function updateInfo() {
    //-- ticker info color change
    tickerInfo.style.color = selectedColor;
    tickerBlock.style.backgroundColor = selectedColor;

    //-- calculate priceChange and percentChange
    const lastIndex = selectedData.length - 1;
    // let firstPrice = selectedData[0].price;
    let lastPrice = selectedData[lastIndex].price;
    // let priceChange = Math.round((lastPrice - firstPrice) * 100) / 100;

    let priceChange = selectedData[lastIndex].priceChange;
    let percentChange = selectedData[lastIndex].percentChange;
    let sign = priceChange == 0 ? "" : "+";
    changeInfo.style.color = upColor;
    if (priceChange < 0) {
      sign = "-";
      changeInfo.style.color = downColor;
    }
    lastPrice = Math.round(lastPrice * 100) / 100;
    //
    chartDiv1.querySelector(".ticker").textContent = selectedTicker;
    indicationHolder1.querySelector(".price").textContent = "$" + lastPrice;
    indicationHolder1.querySelector(".percent").innerHTML = `${sign}${Math.abs(
      percentChange
    )}<span>%</span>`;
    indicationHolder1.querySelector(".value").textContent =
      sign + "$" + Math.abs(priceChange);
  }

  function updateChart() {
    //-- update scales
    xScale = d3
      .scaleUtc()
      .domain(d3.extent(selectedData, xValue))
      .range([0, innerWidth]);
    yScale = d3
      .scaleLinear()
      .domain(d3.extent(selectedData, yValue))
      .range([innerHeight, 0]);

    //-- update grids
    xGridG.call(xGrid);
    yGridG.call(yGrid);

    //-- update ticks
    xAxisB
      .call(d3.axisBottom(xScale).ticks(10).tickFormat(formatTime))
      .call((g) => g.select(".domain").remove());
    xAxisT
      .call(d3.axisTop(xScale).ticks(10).tickFormat(formatTime))
      .call((g) => g.select(".domain").remove());
    yAxis
      .call(d3.axisRight(yScale).ticks(5).tickFormat(d3.format(".2f")))
      .call((g) => g.select(".domain").remove());

    //-- update graph line
    line
      .datum(selectedData)
      .transition()
      .duration(500)
      .attr("stroke", selectedColor)
      .attr(
        "d",
        d3
          .line()
          .x((d) => xScale(d.timestamp))
          .y((d) => yScale(d.price))
      );
  }

  priceChart.update = function () {
    selectedData = dataByTicker.get(tickers[selectedIndex]);
    updateInfo();
    updateChart();
  };

  return priceChart;
}
