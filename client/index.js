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
let orgData; //original data
let dataByTicker; //data map by ticker
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
  orgData = data;

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
  //-- TODO
  // console.log("Change", data);
  /*
  {timestamp: 1638883200000, changes: Array(3)}
    changes: Array(3)
      0: {ticker: 'AAPL', change: -0.0517}
      1: {ticker: 'GOOGL', change: -0.2755}
      2: {ticker: 'MSFT', change: 0.0393}
    timestamp: 1638883200000
  */

  //-- temporarily commented out
  //-- TODO
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

    //-- temporarily commented out
    //-- TODO
    // if (stockChart) {
    //   stockChart.update(selectedTickers);
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

function buildChartPane(pTickers = [tickers[0]]) {
  console.log("buildChartPane, pTickers?? ", pTickers);

  let stockPCChart = {};
  let infoHolders;
  let prices;
  let changeInfos, percents, values;
  buildInfo(pTickers);

  function buildInfo(pTickers = pTickers) {
    console.log("buildChartPane, buildInfo, pTickers ??", pTickers);
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
    prices = chartDiv.querySelectorAll(".ticker-info .category .price");
    changeInfos = chartDiv.querySelectorAll(".change-info");
    percents = chartDiv.querySelectorAll(".change-info .percent");
    values = chartDiv.querySelectorAll(".change-info .value");
    updateInfo(pTickers);
  }
  function updateInfo(pTickers = pTickers) {
    console.log("buildChartPane, updateInfo, pTickers? ", pTickers);
    dataArr = pTickers.map((ticker) => dataByTicker.get(ticker));
    const lastIndex = dataArr[0].length - 1;
    //-- for each ticker
    pTickers.map((ticker, i) => {
      console.log("buildChartPane, updateInfo, i? ", i);
      const priceChange = dataArr[i][lastIndex].priceChange;
      let sign = priceChange == 0 ? "" : "+";
      changeInfos[i].style.color = upColor;
      if (priceChange < 0) {
        sign = "-";
        changeInfos[i].style.color = downColor;
      }
      infoHolders[i].style.top = 60 * i + "px";
      prices[i].textContent =
        "$" + Math.round(dataArr[i][lastIndex].price * 100) / 100;
      percents[i].innerHTML = `${sign}${Math.abs(
        dataArr[i][lastIndex].percentChange
      )}`;
      values[i].textContent = sign + "$" + Math.abs(priceChange);
    });
  }
  function showInfo() {
    console.log("buildChartPane, showInfo");
    indicationHolder.style.visibility = "visible";
  }
  function hideInfo() {
    console.log("buildChartPane, hideInfo");
    indicationHolder.style.visibility = "hidden";
  }

  const chartTypes = ["price", "change"];
  let chartType = pTickers.length <= 1 ? chartTypes[0] : chartTypes[1];
  let svg, line, linesByTicker;
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
  //TODO, temporary
  let selectedData, selectedIndex, selectedColor, selectedTicker;
  let dataArr;
  buildChart(chartType);

  function buildChart(pChartType = chartType) {
    console.log("buildChartPane:: buildChart, pChartType ?? ", pChartType);

    if (svg) {
      d3.selectAll("svg").remove();
    }

    svg = d3
      .select("#chartHolder")
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .append("g");

    //TODO: by chartType

    let selectedTicker, selectedData, selectedColor;
    const buildPriceChart = () => {
      //-- TODO
      // d3.selectAll("svg > *").remove();

      //-- TODO
      selectedTicker = pTickers[0];
      selectedData = dataByTicker.get(selectedTicker);
      selectedColor = colorsByTicker[selectedTicker];
      // svg = d3
      //   .select("#chartHolder")
      //   .append("svg")
      //   .attr("width", width)
      //   .attr("height", height)
      //   .append("g");
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
      if (line) line.remove();
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
    };
    const buildChangeChart = () => {
      console.log(
        "buildChartPane:: buildChangeChart, building comparison chart !!!!!!!!!!!!!!"
      );

      selectedTicker = pTickers[0];
      console.log(
        "buildChartPane:: buildChangeChart, selectedTicker?? ",
        selectedTicker
      );
      selectedData = dataByTicker.get(selectedTicker);
      selectedColor = colorsByTicker[selectedTicker];
      let percentChangeData = [];
      pTickers.map((ticker) => {
        const dataArrByTicker = dataByTicker.get(ticker);
        // console.log("dataArrByTicker??", dataArrByTicker);
        let percentChangeArr = dataArrByTicker.map(
          (item) => item.percentChange
        );
        // console.log("percentChangeArr??", percentChangeArr);
        percentChangeData = [...percentChangeData, ...percentChangeArr];
      });
      percentChangeData.sort();
      console.log("percentChangeData???", percentChangeData);

      xValue = (d) => d["timestamp"];
      yValue = (d) => d["percentChange"];

      //-- set ranges
      xScale = d3
        .scaleUtc()
        .domain(d3.extent(selectedData, xValue))
        .range([0, innerWidth]);
      yScale = d3
        .scaleLinear()
        .domain(d3.extent(percentChangeData, yValue))
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
      // if (line) line.remove();
      // line = svg
      //   .append("g")
      //   .attr("transform", `translate(${margin.left}, ${margin.top})`)
      //   .append("path")
      //   .datum(selectedData)
      //   .attr(
      //     "d",
      //     d3
      //       .line()
      //       .x((d) => xScale(d.timestamp))
      //       .y((d) => yScale(d.percentChange))
      //   )
      //   .attr("stroke", "#ffcc00")
      //   .style("stroke-width", 2)
      //   .style("fill", "none");
    };

    if (pChartType == "price") {
      buildPriceChart();
    } else {
      buildChangeChart();
    }
  }
  function updateChart(transition = true, pTickers = pTickers) {
    console.log("buildChartPane, updateChart, pTickers?? ", pTickers);
    console.log("buildChartPane, updateChart, 1 chartType?? ", chartType);

    if (pTickers.length > 1 && chartType == "price") {
      chartType = "change";
      //TODO
      buildChart("change");
    }

    console.log("buildChartPane, updateChart, 2 chartType?? ", chartType);

    const updatePriceChart = () => {
      console.log("buildChartPane, updatePriceChart");
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
    };

    const updateChangeChart = () => {
      console.log("buildChartPane, updateChangeChart --- not implemented yet");

      //-- update scales
      // xScale = d3
      //   .scaleUtc()
      //   .domain(d3.extent(selectedData, xValue))
      //   .range([0, innerWidth]);
      // yScale = d3
      //   .scaleLinear()
      //   .domain(d3.extent(selectedData, yValue))
      //   .range([innerHeight, 0]);

      //-- update grids
      // xGridG.call(xGrid);
      // yGridG.call(yGrid);

      //-- update ticks
      // xAxisB
      //   .call(d3.axisBottom(xScale).ticks(10).tickFormat(formatTime))
      //   .call((g) => g.select(".domain").remove());
      // xAxisT
      //   .call(d3.axisTop(xScale).ticks(10).tickFormat(formatTime))
      //   .call((g) => g.select(".domain").remove());
      // yAxis
      //   .call(d3.axisRight(yScale).ticks(5).tickFormat(d3.format(".2f")))
      //   .call((g) => g.select(".domain").remove());

      //-- update graph line
      // // line.remove();
      // line
      //   .datum(selectedData)
      //   .transition()
      //   .duration(500)
      //   .attr("stroke", selectedColor)
      //   .attr(
      //     "d",
      //     d3
      //       .line()
      //       .x((d) => xScale(d.timestamp))
      //       .y((d) => yScale(d.price))
      //   );
    };

    if (chartType == "price") {
      updatePriceChart();
    } else {
      updateChangeChart();
    }

    // if (transition) line.transition().duration(500);
  }
  function showChart() {
    console.log("buildChartPane, showChart");
    line.attr("visibility", "visible");
  }
  function hideChart() {
    console.log("buildChartPane, hideChart");
    line.attr("visibility", "hidden");
  }

  stockPCChart.show = function () {
    console.log("stockPCChart.show");
    showInfo();
    showChart();
  };
  stockPCChart.hide = function () {
    console.log("stockPCChart.hide");
    hideInfo();
    hideChart();
  };

  stockPCChart.update = function (pTickers = pTickers) {
    //TODO: temporary, onChange event
    console.log("stockPCChart.update, ever??????? pTickers?? ", pTickers);

    updateInfo(pTickers);
    //TODO: temporary, onChange event
    console.log("stockPCChart.update, selectedIndex ??", selectedIndex);
    selectedData = dataByTicker.get(tickers[selectedIndex]);
    //-- update current chart on "market change" event
    updateChart();
  };
  stockPCChart.redraw = function (pTickers = pTickers) {
    console.log("stockPCChart.redraw, pTickers?? ", pTickers);
    buildInfo(pTickers);
    showInfo();
    //TODO: temporary
    selectedTicker = pTickers[0];
    selectedIndex = tickers.indexOf(selectedTicker);
    selectedColor = colors[selectedIndex];
    selectedData = dataByTicker.get(tickers[selectedIndex]);
    const transition = false;

    updateChart(transition, pTickers);
    showChart();
  };
  stockPCChart.hideChartByTicker = function (pTicker) {
    console.log("stockPCChart.hideChartByTicker, pTicker?? ", pTicker);
  };
  stockPCChart.showChartByTicker = function (pTicker) {
    console.log("stockPCChart.showChartByTicker, pTicker?? ", pTicker);
  };

  return stockPCChart;
}

function updateChartPane(pTickers) {
  console.log("updateChartPane :: pTickers, ", pTickers);
  console.log("updateChartPane :: selectedTickers, ", selectedTickers);
  if (!stockChart) {
    stockChart = buildChartPane(pTickers);
  }
  stockChart.redraw(pTickers);
}

function hideChartPane() {
  console.log("hideChartPane :: selectedTickers, ", selectedTickers);
  stockChart.hide();
}
