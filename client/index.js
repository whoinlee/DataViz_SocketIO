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

//-- format related
const formatTime = utcFormat("%H:%M");
const formatNumber = d3.format(".2f");

//-- chart related
const tickers = ["AAPL", "GOOGL", "FB", "MSFT"];
const colors = ["#1f77b4", "#9467bd", "#ff7f02", "#8c564b"];
const colorMapping = d3.scaleOrdinal(tickers, colors);
const curve = d3.curveLinear;
const upColor = "#2ca02c"; //-- green
const downColor = "#d62728"; //-- red
let stockChart;

//-- data
let dataWithChanges; //data w. additional columns of priceChange and percentChange
let dataByTicker; //data obj by ticker, {"AAPL":[...], "GOOGL":[] ...}
let selectedTickers = []; //current ticker selections
let lastDayData; //previous day's last data

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

  console.log("data loaded!!!!!!!!!!!!!!");
  //-- data w. addtional priceChange and percentChange columns
  dataWithChanges = data;

  //-- clear 'loading' msg
  contentDiv.textContent = "";

  //-- group data by ticker
  dataByTicker = d3.group(dataWithChanges, (d) => d.ticker);

  //-- set priceChange and percentChange columns
  tickers.forEach((currTicker) => {
    let dataArr = dataByTicker.get(currTicker);
    const firstPrice = dataArr[0].price;
    dataArr.forEach((item) => {
      item.priceChange = item.price - firstPrice;
      item.percentChange = ((item.price - firstPrice) / firstPrice) * 100;
    });
  });
  console.log("dataWithChanges", dataWithChanges);
  console.log("dataByTicker", dataByTicker);

  const testData = [];
  let dataByTest = d3.group(testData, (d) => d.ticker);
  console.log("testData", testData);
  console.log("dataByTest", dataByTest);

  buildSelectPane();
});

//-- subscribe to updates
const socket = io();
socket.on("market events", function (data) {
  console.log("\nChange", data);
  if (data.changes.length == 0) return;

  const timestamp = data.timestamp + "";
  const changesArr = data.changes;
  // dataByTicker = d3.group(dataWithChanges, (d) => d.ticker);
  tickers.map((currTicker) => {
    let dataArr = dataByTicker.get(currTicker);
    if (dataArr.length == 0) {
      console.log("RESTART");
      console.log("dataWithChanges?? 2 ", dataWithChanges);
      console.log("dataByTicker?? 2 ", dataByTicker);
    }
    let firstPrice =
      dataArr.length > 0 ? dataArr[0].price : lastDayData[currTicker].price;
    let lastPrice =
      dataArr.length > 0
        ? dataArr[dataArr.length - 1].price
        : lastDayData[currTicker].price;
    let newDataObj = data.changes.find(({ ticker }) => ticker === currTicker);
    lastPrice = newDataObj ? lastPrice + newDataObj.change : lastPrice;
    console.log("lastPrice???", lastPrice);
    const priceChange = lastPrice - firstPrice;
    let percentChange =
      firstPrice == 0 ? 0 : ((lastPrice - firstPrice) / firstPrice) * 100;
    dataWithChanges.push({
      timestamp: timestamp,
      ticker: currTicker,
      price: lastPrice,
      priceChange: priceChange,
      percentChange: percentChange,
    });
    // if (dataArr.length == 0) dataByTicker =
    // dataArr.push({
    //   timestamp: timestamp,
    //   ticker: currTicker,
    //   price: lastPrice,
    //   priceChange: priceChange,
    //   percentChange: percentChange,
    // });
    if (dataArr.length == 1) {
      console.log("dataWithChanges?? 3 ", dataWithChanges);
      console.log("dataByTicker?? 3 ", dataByTicker);
    }
  });

  dataByTicker = d3.group(dataWithChanges, (d) => d.ticker);
  console.log("dataByTicker?? 4 ", dataByTicker);

  if (stockChart) stockChart.update();
});
socket.on("start new day", function (data) {
  console.log("\nNewDay", data);
  console.log("=============>");

  //-- reset dataWithChanges & dataByTicker;
  lastDayData = new Object();
  tickers.map((currTicker) => {
    let dataArr = dataByTicker.get(currTicker);
    lastDayData[currTicker] = dataArr[dataArr.length - 1];
    console.log("lastDayData[currTicker]", lastDayData[currTicker]);
    dataArr.length = 0;
  });

  console.log("lastDayData", lastDayData);

  dataWithChanges = new Array();
  // dataByTicker = d3.group(dataWithChanges, (d) => d.ticker);
  console.log("dataWithChange", dataWithChanges);
  console.log("dataByTicker", dataByTicker);
  console.log("=============>");
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
      if (selectedTickers.length == 0) {
        hideChartPane();
      } else {
        updateChartPane(selectedTickers);
      }
    });
  });
}

function buildChartPane(pTickers) {
  // console.log("buildChartPane, pTickers ?? ", pTickers);

  let stockPCChart = {};
  let chartDiv, indicationHolder, infoHolders;
  let prices;
  let changeInfos, percents, values;
  buildInfo(pTickers);

  function buildInfo(pTickers = selectedTickers) {
    // console.log("buildChartPane, buildInfo, pTickers ??", pTickers);

    if (!chartDiv) {
      chartDiv = contentDiv.appendChild(document.createElement("div"));
      chartDiv.setAttribute("class", "chartDiv");
      chartDiv.innerHTML = `
        <div class="chartHolder" id="chartHolder"></div>
        <div class="indicationHolder" id="indicationHolder">
        </div>
      `;
      indicationHolder = document.getElementById("indicationHolder");
    }
    indicationHolder.innerHTML = pTickers
      .map(
        (ticker) => `<div class="infoHolder">
        <div class="ticker-info" style="color: ${colorMapping(ticker)}">
          <div class="block" style="background-color: ${colorMapping(
            ticker
          )}"></div>
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
  function updateInfo(pTickers = selectedTickers) {
    // console.log("buildChartPane, updateInfo, pTickers? ", pTickers);
    if (pTickers.length == 0 || !pTickers) return;

    dataArr = pTickers.map((ticker) => dataByTicker.get(ticker));
    const lastIndex = dataArr[0].length - 1;
    //-- for each ticker
    pTickers.forEach((ticker, i) => {
      const priceChange = dataArr[i][lastIndex].priceChange;
      let sign = "+";
      changeInfos[i].style.color = upColor;
      if (priceChange < 0) {
        sign = "-";
        changeInfos[i].style.color = downColor;
      }
      infoHolders[i].style.top = 60 * i + "px";
      prices[i].textContent = "$" + formatNumber(dataArr[i][lastIndex].price);
      percents[i].innerHTML = `${sign}${formatNumber(
        Math.abs(dataArr[i][lastIndex].percentChange)
      )}<span>%</span>`;
      values[i].textContent = sign + "$" + formatNumber(Math.abs(priceChange));
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
  let svg, line, lines, rule, ruleLabels, circles;
  let xScale, yScale, zScale, xValue, yValue, zValue;
  let xGrid, yGrid, xGridG, yGridG, xAxisB, xAxisT, yAxis;
  let selectedData, selectedColor, selectedTicker;
  let dataArr;
  buildChart(pTickers);

  function buildChart(pTickers = selectedTickers) {
    // console.log("buildChartPane:: buildChart, pTickers ?? ", pTickers);
    if (pTickers.length < 1) return;

    if (svg) d3.selectAll("svg").remove();
    svg = d3
      .select("#chartHolder")
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      // .attr("viewBox", [0, 0, width, height])
      // .attr("style", "max-width: 100%; height: auto; height: intrinsic;")
      .append("g");

    let selectedTicker, selectedData, selectedColor;
    const buildPriceChart = () => {
      selectedTicker = pTickers[0];
      selectedData = dataByTicker.get(selectedTicker);
      selectedColor = colorMapping(selectedTicker);

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
        .call(d3.axisRight(yScale).ticks(5).tickFormat(formatNumber))
        .call((g) => g.select(".domain").remove());

      //-- draw a line
      if (lines && lines.length > 0) lines.forEach((line) => line.remove());
      lines = [];
      line = svg
        .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`)
        .append("path")
        .datum(selectedData)
        .attr(
          "d",
          d3
            .line()
            .curve(curve)
            .x((d) => xScale(d.timestamp))
            .y((d) => yScale(d.price))
        )
        .attr("stroke", selectedColor)
        .style("stroke-width", 2)
        .style("fill", "none");
      lines = [line];

      // rule = svg.append("g");
      // rule
      //   .append("line")
      //   .attr("y1", margin.top)
      //   .attr("y2", height - margin.bottom)
      //   .attr("stroke", "#000");

      // const lastXValue = xScale(selectedData[selectedData.length - 1]);
      // const lastYValue = yScale(selectedData[selectedData.length - 1]);
      // circle = svg
      //   .append("g")
      //   .attr("transform", `translate(${margin.left}, ${margin.top})`)
      //   .append("circle")
      //   .attr("cx", lastXValue)
      //   .attr("cy", lastYValue)
      //   .attr("r", 4)
      //   .style("fill", selectedColor);
      // circles = circle;
    };
    const buildChangeChart = () => {
      xValue = (d) => d["timestamp"];
      yValue = (d) => d["percentChange"];
      zValue = (d) => d["ticker"]; //TODO

      //-- set ranges
      xScale = d3
        .scaleUtc()
        .domain(d3.extent(dataWithChanges, xValue))
        .range([0, innerWidth]);
      yScale = d3
        .scaleLinear()
        .domain(d3.extent(dataWithChanges, yValue))
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
          .attr("y1", 0 + margin.top - 8) /* 8px extra long to the top */
          .attr(
            "y2",
            height - margin.bottom + 8
          ); /* 8px extra long to the bottom */
      yGrid = (g) =>
        g
          .attr("class", "hline")
          .selectAll("line")
          .data(yScale.ticks(5))
          .join("line")
          .attr("x1", 0)
          .attr("x2", innerWidth + 75) /* 75px extra wide to the right */
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
        .call(
          d3
            .axisRight(yScale)
            .ticks(5)
            .tickFormat((d) => d3.format("+.1f")(d) + "%")
        )
        .call((g) => g.select(".domain").remove());

      //-- draw a line
      if (lines && lines.length > 0) lines.forEach((line) => line.remove());
      lines = [];
      pTickers.forEach((ticker) => {
        const line = svg
          .append("g")
          .attr("transform", `translate(${margin.left}, ${margin.top})`)
          .append("path")
          .datum(dataByTicker.get(ticker))
          .attr(
            "d",
            d3
              .line()
              .x((d) => xScale(d.timestamp))
              .y((d) => yScale(d.percentChange))
          )
          .attr("stroke", colorMapping(ticker))
          .style("stroke-width", 2)
          .style("fill", "none");
        lines.push(line);

        // const selectedData = dataByTicker.get(ticker);
        // const lastXValue = xScale(selectedData[selectedData.length - 1]);
        // const lastYValue = yScale(selectedData[selectedData.length - 1]);
        // const circle = svg
        //   .append("g")
        //   .attr("transform", `translate(${margin.left}, ${margin.top})`)
        //   .append("circle")
        //   .attr("cx", lastXValue)
        //   .attr("cy", lastYValue)
        //   .attr("r", 4)
        //   .style("fill", selectedColor);
        // circles.push(circle);
      });
    };

    if (pTickers.length == 1) {
      buildPriceChart();
    } else {
      buildChangeChart();
    }
  }
  function updateChart(
    transition = true,
    pChartType = chartType,
    pTickers = selectedTickers
  ) {
    console.log("updateChart :: ");

    const updatePriceChart = () => {
      // console.log("buildChartPane :: updateChart, updatePriceChart");

      if (!pTickers[0]) return;
      selectedTicker = pTickers[0];
      selectedColor = colorMapping(selectedTicker);
      selectedData = dataByTicker.get(selectedTicker);

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
        .call(d3.axisRight(yScale).ticks(5).tickFormat(formatNumber))
        .call((g) => g.select(".domain").remove());

      //-- update graph line
      lines[0]
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

      // const lastXValue = xScale(selectedData[selectedData.length - 1]);
      // const lastYValue = yScale(selectedData[selectedData.length - 1]);
      // circles[0].attr("cx", lastXValue).attr("cy", lastYValue);
    };

    const updateChangeChart = () => {
      console.log("buildChartPane :: updateChart, updateChangeChart");
      console.log(
        "buildChartPane :: updateChart, dataWithChanges",
        dataWithChanges
      );

      //-- update scales
      xScale = d3
        .scaleUtc()
        .domain(d3.extent(dataWithChanges, xValue))
        .range([0, innerWidth]);
      yScale = d3
        .scaleLinear()
        .domain(d3.extent(dataWithChanges, yValue))
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
        .call(
          d3
            .axisRight(yScale)
            .ticks(5)
            .tickFormat((d) => d3.format("+.1f")(d) + "%")
        )
        .call((g) => g.select(".domain").remove());

      //-- update graph line
      if (lines && lines.length > 0) lines.forEach((line) => line.remove());
      lines = [];
      pTickers.forEach((ticker, i) => {
        const line = svg
          .append("g")
          .attr("transform", `translate(${margin.left}, ${margin.top})`)
          .append("path")
          .datum(dataByTicker.get(ticker))
          .attr(
            "d",
            d3
              .line()
              .x((d) => xScale(d.timestamp))
              .y((d) => yScale(d.percentChange))
          )
          .attr("stroke", colorMapping(ticker))
          .style("stroke-width", 2)
          .style("fill", "none");
        // if (transition) line.transition().duration(500);
        lines.push(line);

        // const circle = circles[i];
        // const lastXValue = xScale(selectedData[selectedData.length - 1]);
        // const lastYValue = yScale(selectedData[selectedData.length - 1]);
        // circle.attr("cx", lastXValue).attr("cy", lastYValue);
      });
    };

    if (pChartType == "price") {
      updatePriceChart();
    } else {
      updateChangeChart();
    }
  }
  function redrawChart(transition = true, pTickers = selectedTickers) {
    console.log("redrawChart :: chartType?? 1 ", chartType);

    if (pTickers.length > 1 && chartType == "price") {
      chartType = "change";
      buildChart(pTickers);
    }

    if (pTickers.length == 1 && chartType == "change") {
      chartType = "price";
      buildChart(pTickers);
    }
    console.log("redrawChart :: chartType?? 2 ", chartType);
    updateChart(transition, chartType, pTickers);
  }
  function showChart() {
    // console.log("buildChartPane, showChart, lines?", lines);

    if (lines && lines.length > 0) {
      lines.forEach((line) => line.attr("visibility", "visible"));
      // circles.forEach((circle) => circle.attr("visibility", "visible"));
    }
    if (rule) rule.attr("visibility", "visible");
    const texts = document.getElementById("yAxisR").querySelectorAll("text");
    texts.forEach((text) => (text.style.visibility = "visible"));
  }
  function hideChart() {
    // console.log("buildChartPane, hideChart, lines?", lines);

    if (lines && lines.length > 0) {
      lines.forEach((line) => line.attr("visibility", "hidden"));

      // circles.forEach((circle) => circle.attr("visibility", "hidden"));
    }
    if (rule) rule.attr("visibility", "hidden");
    const texts = document.getElementById("yAxisR").querySelectorAll("text");
    texts.forEach((text) => (text.style.visibility = "hidden"));
  }

  stockPCChart.show = function () {
    // console.log("stockPCChart.show");
    showInfo();
    showChart();
  };
  stockPCChart.hide = function () {
    // console.log("stockPCChart.hide");
    hideInfo();
    hideChart();
  };
  stockPCChart.update = function () {
    // console.log("stockPCChart.update");
    updateInfo();
    updateChart();
  };
  stockPCChart.redraw = function (pTickers = selectedTickers) {
    // console.log("stockPCChart.redraw, pTickers?? ", pTickers);
    buildInfo(pTickers);
    showInfo();

    //TODO, transition?
    const transition = true;
    redrawChart(transition, pTickers);
    showChart();
  };

  return stockPCChart;
}

function updateChartPane(pTickers = selectedTickers) {
  // console.log("updateChartPane :: pTickers, ", pTickers);
  if (!stockChart) {
    stockChart = buildChartPane(pTickers);
  } else {
    stockChart.redraw(pTickers);
  }
}

function hideChartPane() {
  // console.log("hideChartPane :: selectedTickers, ");
  stockChart.hide();
}

function resetChartPane() {
  //-- TODO
}
