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
let dataByTicker; //data map by ticker
let lastDayData; //previous day's last data
let selectedTickers = []; //current ticker selections

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
  // console.log("data loaded!!!!!!!!!!!!!!");

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

  buildSelectPane();
});

//-- subscribe to updates
const socket = io();
socket.on("market events", function (data) {
  // console.log("\nChange", data);
  if (data.changes.length == 0) return;

  const timestamp = data.timestamp + "";
  const changesArr = data.changes;

  //-- update history data w. additional data
  tickers.map((currTicker) => {
    let dataArr = dataByTicker.get(currTicker);
    let firstPrice =
      dataArr.length > 0 ? dataArr[0].price : lastDayData[currTicker].price;
    let lastPrice =
      dataArr.length > 0
        ? dataArr[dataArr.length - 1].price
        : lastDayData[currTicker].price;
    let newDataObj = data.changes.find(({ ticker }) => ticker === currTicker);
    lastPrice = newDataObj ? lastPrice + newDataObj.change : lastPrice;
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
  });
  dataByTicker = d3.group(dataWithChanges, (d) => d.ticker);

  //-- update chart w. additional data
  updateChartPane();
});
socket.on("start new day", function (data) {
  console.log("\nNewDay", data);

  //-- reset data and save the lastDayData
  lastDayData = new Object();
  tickers.map((currTicker) => {
    let dataArr = dataByTicker.get(currTicker);
    lastDayData[currTicker] = dataArr[dataArr.length - 1];
    dataArr.length = 0;
  });
  dataWithChanges = new Array();
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
        redrawChartPane(selectedTickers);
      }
    });
  });
}

function buildChartPane(pTickers = selectedTickers) {
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
    // console.log("buildChartPane, showInfo");
    indicationHolder.style.visibility = "visible";
  }
  function hideInfo() {
    // console.log("buildChartPane, hideInfo");
    indicationHolder.style.visibility = "hidden";
  }

  const chartTypes = ["price", "change"];
  let chartType = pTickers.length <= 1 ? chartTypes[0] : chartTypes[1];
  let svg, line, lines, rule, circle, circles;
  let xScale, yScale, xValue, yValue;
  let xGrid, yGrid, xGridG, yGridG, xAxisB, xAxisT, yAxis;
  let zScale, zValue; //TODO
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

      //-- draw a price line
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
            .x(xValue) //12/08
            .y(yValue) //12/08
        )
        .attr("class", "line") //12/08
        .attr("stroke", selectedColor)
        .style("stroke-width", 2)
        .style("fill", "none");
      lines = [line];

      // rule = svg.append("g").attr("class", "mouse-over-effects");
      // rule
      //   .append("path")
      //   .attr("class", "mouse-line")
      //   .attr("y1", margin.top)
      //   .attr("y2", height - margin.bottom)
      //   .attr("stroke", "#f00");
      // // .style("opacity", "1");
      // console.log("rule??", rule);

      // var mousePerLine = rule
      //   .selectAll(".mouse-per-line")
      //   .data(selectedTicker)
      //   .enter()
      //   .append("g")
      //   .attr("class", "mouse-per-line");

      // mousePerLine
      //   .append("circle")
      //   .attr("r", 4)
      //   .style("fill", selectedColor)
      //   .style("opacity", "0");

      // mousePerLine.append("text").attr("transform", "translate(10,3)");

      // rule
      //   .append("svg:rect") // append a rect to catch mouse movements on canvas
      //   .attr("width", width) // can't catch mouse events on a g element
      //   .attr("height", height)
      //   .attr("fill", "none")
      //   .attr("pointer-events", "all")
      //   .on("mouseout", function () {
      //     // on mouse out hide line, circles and text
      //     d3.select(".mouse-line").style("opacity", "0");
      //     d3.selectAll(".mouse-per-line circle").style("opacity", "0");
      //     d3.selectAll(".mouse-per-line text").style("opacity", "0");
      //   })
      //   .on("mouseover", function () {
      //     // on mouse in show line, circles and text
      //     d3.select(".mouse-line").style("opacity", "1");
      //     d3.selectAll(".mouse-per-line circle").style("opacity", "1");
      //     d3.selectAll(".mouse-per-line text").style("opacity", "1");
      //   })
      //   .on("mousemove", function () {
      //     // mouse moving over canvas
      //     var mouse = d3.mouse(this);
      //     d3.select(".mouse-line").attr("d", function () {
      //       var d = "M" + mouse[0] + "," + height;
      //       d += " " + mouse[0] + "," + 0;
      //       return d;
      //     });

      //     d3.selectAll(".mouse-per-line").attr("transform", function (d, i) {
      //       console.log(width / mouse[0]);
      //       var xDate = x.invert(mouse[0]),
      //         bisect = d3.bisector(function (d) {
      //           return d.date;
      //         }).right;
      //       idx = bisect(d.values, xDate);

      //       var beginning = 0,
      //         end = lines[i].getTotalLength(),
      //         target = null;

      //       while (true) {
      //         target = Math.floor((beginning + end) / 2);
      //         pos = lines[i].getPointAtLength(target);
      //         if (
      //           (target === end || target === beginning) &&
      //           pos.x !== mouse[0]
      //         ) {
      //           break;
      //         }
      //         if (pos.x > mouse[0]) end = target;
      //         else if (pos.x < mouse[0]) beginning = target;
      //         else break; //position found
      //       }

      //       d3.select(this).select("text").text(y.invert(pos.y).toFixed(2));

      //       return "translate(" + mouse[0] + "," + pos.y + ")";
      //     });
      //   }); //-- rule

      //-- build a circle in the end of price line
      console.log("1 circles??", circles);
      if (circles && circles.length > 0) {
        circles.forEach((circle) => circle.remove());
        circles = [];
      }
      const lastXValue = xScale(xValue(selectedData[selectedData.length - 1]));
      const lastYValue = yScale(yValue(selectedData[selectedData.length - 1]));
      circle = svg
        .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`)
        .append("circle");
      circle
        .attr("cx", lastXValue)
        .attr("cy", lastYValue)
        .attr("r", 4)
        .style("fill", selectedColor);
      circles = [circle];
    }; //buildPriceChart
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
      if (circles && circles.length > 0)
        circles.forEach((circle) => circle.remove());
      circles = [];
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
              .x(xValue) //12/08
              .y(yValue) //12/08
          )
          .attr("class", "line")
          .attr("stroke", colorMapping(ticker))
          .style("stroke-width", 2)
          .style("fill", "none");
        lines.push(line);

        //-- draw circles
        const selectedData = dataByTicker.get(ticker);
        const lastXValue = xScale(
          xValue(selectedData[selectedData.length - 1])
        );
        const lastYValue = yScale(
          yValue(selectedData[selectedData.length - 1])
        );
        const circle = svg
          .append("g")
          .attr("transform", `translate(${margin.left}, ${margin.top})`)
          .append("circle");
        circle
          .attr("cx", lastXValue)
          .attr("cy", lastYValue)
          .attr("r", 4)
          .style("fill", colorMapping(ticker));
        circles.push(circle);
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
    // console.log("updateChart :: ");

    const updatePriceChart = () => {
      console.log("buildChartPane :: updateChart, updatePriceChart");

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
            .x((d) => xScale(d.timestamp)) //12/08
            .y((d) => yScale(d.price)) //12/08
        );

      //-- update the circle in the end of the graph line
      const lastXValue = xScale(xValue(selectedData[selectedData.length - 1]));
      const lastYValue = yScale(yValue(selectedData[selectedData.length - 1]));
      console.log("circles[0] in the price update", circles[0]);
      circles[0]
        .style("fill", selectedColor)
        .attr("cx", lastXValue)
        .attr("cy", lastYValue);
    };

    const updateChangeChart = () => {
      // console.log("buildChartPane :: updateChart, updateChangeChart");

      // xValue = (d) => d["timestamp"];
      // yValue = (d) => d["percentChange"];

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
      if (circles && circles.length > 0)
        circles.forEach((circle) => circle.remove());
      circles = [];
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
              .x((d) => xScale(d.timestamp)) //12/08
              .y((d) => yScale(d.percentChange)) //12/08
          )
          .attr("stroke", colorMapping(ticker))
          .style("stroke-width", 2)
          .style("fill", "none");

        // if (transition) line.transition().duration(500);
        lines.push(line);

        const selectedData = dataByTicker.get(ticker);
        const lastXValue = xScale(
          xValue(selectedData[selectedData.length - 1])
        );
        const lastYValue = yScale(
          yValue(selectedData[selectedData.length - 1])
        );
        const circle = svg
          .append("g")
          .attr("transform", `translate(${margin.left}, ${margin.top})`)
          .append("circle");
        circle
          .attr("cx", lastXValue)
          .attr("cy", lastYValue)
          .attr("r", 4)
          .style("fill", colorMapping(ticker));
        circles.push(circle);
      });
    };

    if (pChartType == "price") {
      updatePriceChart();
    } else {
      updateChangeChart();
    }
  } //updateChart
  function redrawChart(transition = true, pTickers = selectedTickers) {
    // console.log("redrawChart :: chartType?? 1 ", chartType);

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
  } //redrawChart
  function showChart() {
    // console.log("buildChartPane, showChart, lines?", lines);

    //-- price/change lines
    if (lines && lines.length > 0)
      lines.forEach((line) => line.attr("visibility", "visible"));

    //-- circles in the end of lines
    if (circles && circles.length > 0)
      circles.forEach((circle) => circle.attr("visibility", "visible"));

    //-- vertical line that shows the infos of lines
    // if (rule) rule.attr("visibility", "visible");

    //-- prices/changes ticks
    const texts = document.getElementById("yAxisR").querySelectorAll("text");
    texts.forEach((text) => (text.style.visibility = "visible"));
  } //showChart
  function hideChart() {
    // console.log("buildChartPane, hideChart, lines?", lines);

    //-- price/change lines
    if (lines && lines.length > 0)
      lines.forEach((line) => line.attr("visibility", "hidden"));

    //-- circles in the end of lines
    if (circles && circles.length > 0)
      circles.forEach((circle) => circle.attr("visibility", "hidden"));

    //-- vertical line that shows the infos of lines
    // if (rule) rule.attr("visibility", "hidden");

    //-- prices/changes ticks
    const texts = document.getElementById("yAxisR").querySelectorAll("text");
    texts.forEach((text) => (text.style.visibility = "hidden"));
  } //hideChart

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

function updateChartPane() {
  if (stockChart) stockChart.update();
}

function redrawChartPane(pTickers = selectedTickers) {
  console.log("redrawChartPane :: pTickers, ", pTickers);

  if (!stockChart) {
    stockChart = buildChartPane(pTickers);
  } else {
    stockChart.redraw(pTickers);
  }
}

function hideChartPane() {
  stockChart.hide();
  //-- TODO::destroy??
}
