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
let chartDiv, chartHolder, indicationHolder;

//-- time related
const formatTime = utcFormat("%H:%M");

//-- chart related
const tickers = ["AAPL", "GOOGL", "FB", "MSFT"];
const colors = ["#1f77b4", "#9467bd", "#ff7f02", "#8c564b"];
const colorsByTicker = {
  AAPL: "#1f77b4",
  GOOGL: "#9467bd",
  FB: "#ff7f02",
  MSFT: "#8c564b",
};
const upColor = "#2ca02c"; //-- green
const downColor = "#d62728"; //-- red
let stockChart;

//-- data
let dataByTicker; //map
let selectedTickers = [];

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
  contentDiv.textContent = ""; //-- clear 'loading' msg

  //-- group data by ticker
  dataByTicker = d3.group(data, (d) => d.ticker);
  //-- set priceChange and percentChange columns
  tickers.map((currTicker) => {
    let dataArr = dataByTicker.get(currTicker);
    const firstPrice = dataArr[0].price;
    dataArr.forEach((item) => {
      item.priceChange = Math.round((item.price - firstPrice) * 100) / 100;
      item.percentChange =
        Math.round(((item.price - firstPrice) / firstPrice) * 10000) / 100;
    });
  });

  buildSelectPane();
});

//-- subscribe to updates
const socket = io();
socket.on("market events", function (data) {
  // console.log("Change", data);
  /*
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
      const priceChange = Math.round((lastPrice - firstPrice) * 100) / 100;
      const percentChange =
        Math.round(((lastPrice - firstPrice) / firstPrice) * 10000) / 100;
      dataArr.push({
        timestamp: timestamp,
        ticker: currTicker,
        price: lastPrice,
        priceChange: priceChange,
        percentChange: percentChange,
      });
    });

    // if (stockChart.update) {
    //   stockChart.update();
    // }
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
});

function buildSelectPane() {
  const selectPane = contentDiv.appendChild(document.createElement("div"));
  selectPane.setAttribute("class", "selectDiv");
  selectPane.innerHTML = tickers
    .map(
      (ticker, i) =>
        `<span style="color:${colors[i]}">${ticker} <input type="checkbox" value="${ticker}" id="${ticker}Check"/></span>`
    )
    .join("");

  tickers.map((ticker) => {
    const checkBox = document.getElementById(`${ticker}Check`);
    checkBox.addEventListener("click", (e) => {
      const selectedTicker = e.target.value;
      if (e.target.checked) {
        if (selectedTickers.indexOf(selectedTicker) < 0)
          selectedTickers.push(selectedTicker);
      } else {
        selectedTickers.splice(selectedTickers.indexOf(selectedTicker), 1);
      }
      console.log("selectedTickers??", selectedTickers);
      if (selectedTickers.length == 0) {
        hideChartPane();
      } else {
        updateChartPane(selectedTickers);
      }
    });
  });
}

function buildChartPane() {
  console.log("buildChartPane :: selectedTickers, ", selectedTickers);
  if (selectedTickers.length == 0) selectedTickers = [tickers[0]];
  stockChart = buildStockChart();
}

function hideChartPane() {
  console.log("hideChartPane :: selectedTickers, ", selectedTickers);
  stockChart.hide();
}

function updateChartPane(pTickers) {
  console.log("updateChartPane :: pTickers, ", pTickers);
  console.log("updateChartPane :: selectedTickers, ", selectedTickers);
  if (!stockChart) buildChartPane();
  stockChart.redraw(pTickers);
}

// function buildStockChart(pTicker = "AAPL") {
function buildStockChart(pTickers = [tickers[0]]) {
  console.log("buildStockChart, pTickers?? ", pTickers);
  const chartTypes = ["price", "change"];
  let chartType = pTickers.length <= 1 ? chartTypes[0] : chartTypes[1];

  let stockPCChart = {};
  //TODO, temporary
  let selectedData, selectedIndex, selectedColor, selectedTicker;
  let dataArr;
  let infoHolders;
  let tickerInfos, tickerBlocks, prices;
  let changeInfos, percents, values;
  buildInfo(pTickers);
  function buildInfo(pTickers) {
    console.log("buildStockChart, buildInfo, pTickers ??", pTickers);
    if (!chartDiv) {
      chartDiv = contentDiv.appendChild(document.createElement("div"));
      chartDiv.setAttribute("class", "chartDiv");
      chartDiv.innerHTML = `
        <div class="chartHolder" id="chartHolder"></div>
        <div class="indicationHolder" id="indicationHolder">
        </div>
      `;
      chartHolder = document.getElementById("chartHolder");
      indicationHolder = document.getElementById("indicationHolder");
    }
    indicationHolder.innerHTML = pTickers
      .map(
        (ticker) => `<div class="infoHolder">
        <div class="ticker-info" style="color: ${colorsByTicker[ticker]}">
          <div class="block" style="background-color: ${colorsByTicker[ticker]}"></div>
          <div class="category">
              <div class="ticker">${ticker}</div>
              <div class="price">$100.00</div>
          </div>
        </div>
        <div class="change-info">
          <div class="percent">+0.86<span>%</span></div>
          <div class="value">+$1.05</div>
        </div>
    </div>`
      )
      .join("");

    infoHolders = chartDiv.querySelectorAll(".infoHolder");
    tickerInfos = chartDiv.querySelectorAll(".ticker-info");
    tickerBlocks = chartDiv.querySelectorAll(".ticker-info .block");
    prices = chartDiv.querySelectorAll(".ticker-info .category .price");
    changeInfos = chartDiv.querySelectorAll(".change-info");
    percents = chartDiv.querySelectorAll(".change-info .percent");
    values = chartDiv.querySelectorAll(".change-info .value");
    updateInfo(pTickers);
  }
  function updateInfo(pTickers) {
    console.log("buildStockChart, updateInfo, pTickers? ", pTickers);
    dataArr = pTickers.map((ticker) => dataByTicker.get(ticker));
    const lastIndex = dataArr[0].length - 1;
    //-- for each ticker
    pTickers.map((ticker, i) => {
      console.log("buildStockChart, updateInfo, i? ", i);
      const priceChange = dataArr[i][lastIndex].priceChange;
      const percentChange = dataArr[i][lastIndex].percentChange;
      let sign = priceChange == 0 ? "" : "+";
      // console.log("changeInfos?? ", changeInfos);
      changeInfos[i].style.color = upColor;
      if (priceChange < 0) {
        sign = "-";
        changeInfos[i].style.color = downColor;
      }
      infoHolders[i].style.top = 60 * i + "px";
      // tickerInfos[i].style.color = tickerBlocks[i].style.backgroundColor =
      //   colors[i];
      prices[i].textContent =
        "$" + Math.round(dataArr[i][lastIndex].price * 100) / 100;
      percents[i].innerHTML = `${sign}${Math.abs(
        dataArr[i][lastIndex].percentChange
      )}`;
      values[i].textContent = sign + "$" + Math.abs(priceChange);
    });
  }
  function showInfo() {
    console.log("buildStockChart, showInfo");
    indicationHolder.style.visibility = "visible";
  }
  function hideInfo() {
    console.log("buildStockChart, hideInfo");
    indicationHolder.style.visibility = "hidden";
  }

  let svg, line;
  let xScale,
    yScale,
    xValue,
    yValue,
    xGrid,
    yGrid,
    xGridG,
    yGridG,
    xAxisB,
    xAxisT,
    yAxis;
  buildChart();
  function buildChart() {
    console.log("buildStockChart, buildChart");
    //-----------------------------//
    //-------- build chart --------//
    //-----------------------------//
    //TODO: by chartType
    const selectedData = dataByTicker.get(tickers[0]);
    const selectedColor = colors[selectedIndex];
    svg = d3
      .select("#chartHolder")
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .append("g");
    xValue = (d) => d["timestamp"];
    yValue = (d) => d["price"];

    //-- set ranges
    xScale = d3
      .scaleUtc()
      .domain(d3.extent(selectedData, xValue))
      .range([0, innerWidth]);
    yScale = d3
      .scaleLinear()
      .domain(d3.extent(selectedData, yValue))
      .range([innerHeight, 0]);

    //-- set grids :: vertical xGrid and horizontal yGrid
    xGrid = (g) =>
      g
        .attr("class", "vline")
        .selectAll("line")
        .data(xScale.ticks(10))
        .join("line")
        .attr("x1", (d) => xScale(d))
        .attr("x2", (d) => xScale(d))
        .attr("y1", 0 + margin.top - 8) /* 8px extra long */
        .attr("y2", height - margin.bottom + 8); /* 8px extra long */
    yGrid = (g) =>
      g
        .attr("class", "hline")
        .selectAll("line")
        .data(yScale.ticks(5))
        .join("line")
        .attr("x1", 0)
        .attr("x2", innerWidth + 75) /* 75px extra wide */
        .attr("y1", (d) => yScale(d))
        .attr("y2", (d) => yScale(d));
    xGridG = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(xGrid);
    yGridG = svg
      .append("g")
      .attr("transform", `translate(0, ${margin.top})`)
      .call(yGrid);

    //-- add X axis
    xAxisB = svg
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
    xAxisT = svg
      .append("g")
      .attr("id", "xAxisT")
      .attr("class", "xAxis")
      .attr("transform", `translate(${margin.left}, ${margin.top - 8})`);
    xAxisT
      .call(d3.axisTop(xScale).ticks(10).tickFormat(formatTime))
      .call((g) => g.select(".domain").remove());

    //-- add Y axis
    yAxis = svg
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
    line = svg
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
  }
  function updateChart(transition = true) {
    console.log("buildStockChart, updateChart");
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
    // line.remove();
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
    // if (transition) line.transition().duration(500);
  }
  function showChart() {
    console.log("buildStockChart, showChart");
    line.attr("visibility", "visible");
  }
  function hideChart() {
    console.log("buildStockChart, hideChart");
    line.attr("visibility", "hidden");
  }

  function buildTickerSelection() {
    //-- build ticker select drop-down
    // tickerSelection = chartDiv.appendChild(document.createElement("select"));
    // tickerSelection.setAttribute("id", "tickerSelection");
    // d3.select("#tickerSelection")
    //   .selectAll("myOptions")
    //   .data(tickers)
    //   .enter()
    //   .append("option")
    //   .text((d) => d)
    //   .attr("value", (d) => d);
    // //-- on tickerSelection change, update chart
    // d3.select("#tickerSelection").on("change", (e) => {
    //   selectedIndex = e.target.selectedIndex;
    //   selectedTicker = tickers[selectedIndex];
    //   selectedColor = colors[selectedIndex];
    //   selectedData = dataByTicker.get(tickers[selectedIndex]);
    //   updateInfo();
    //   updateChart();
    // });
  }

  stockPCChart.hide = function () {
    console.log("stockPCChart.hide");
    hideInfo();
    hideChart();
  };
  stockPCChart.update = function () {
    console.log("stockPCChart.update");
    //TODO: temporary
    selectedData = dataByTicker.get(tickers[selectedIndex]);
    updateInfo();
    updateChart();
  };
  stockPCChart.redraw = function (pTickers) {
    console.log("stockPCChart.redraw, pTickers?? ", pTickers);
    //TODO: temporary
    selectedTicker = pTickers[0];
    selectedIndex = tickers.indexOf(selectedTicker);
    selectedColor = colors[selectedIndex];
    selectedData = dataByTicker.get(tickers[selectedIndex]);
    const transition = false;
    buildInfo(pTickers);
    showInfo();
    updateChart(transition);
    showChart();
  };

  return stockPCChart;
}
