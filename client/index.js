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
const formatPercent = d3.format("+.1f");

//-- chart related
const tickers = ["AAPL", "GOOGL", "FB", "MSFT"];
const colors = ["#1f77b4", "#9467bd", "#ff7f02", "#8c564b"];
const colorMapping = d3.scaleOrdinal(tickers, colors);
const curve = d3.curveLinear;
const upColor = "#2ca02c"; //-- green
const downColor = "#d62728"; //-- red

//-- data
let stockData; //-- data w. additional columns of priceChange and percentChange
let stockChart; //-- a chartPane Object
let selectedTickers = []; //-- current ticker selections

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
  //-- data w. addtional priceChange and percentChange columns
  stockData = data;

  //-- clear 'loading' msg
  contentDiv.textContent = "";

  //-- set priceChange and percentChange columns
  const dataByTicker = d3.group(stockData, (d) => d.ticker); //-- group data by ticker
  tickers.forEach((currTicker) => {
    const dataArr = dataByTicker.get(currTicker);
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
  //   console.log("\nChange", data);

  const timestamp = data.timestamp + "";

  //-- update history data w. additional data
  let dataByTicker = d3.group(stockData, (d) => d.ticker);
  tickers.map((currTicker) => {
    const dataArr = dataByTicker.get(currTicker);
    const firstPrice = dataArr[0].price;
    let lastPrice = dataArr[dataArr.length - 1].price;
    const newDataObj = data.changes.find(({ ticker }) => ticker === currTicker);
    lastPrice = newDataObj ? lastPrice + newDataObj.change : lastPrice;
    const priceChange = lastPrice - firstPrice;
    const percentChange = ((lastPrice - firstPrice) / firstPrice) * 100;
    stockData.push({
      timestamp: timestamp,
      ticker: currTicker,
      price: lastPrice,
      priceChange: priceChange,
      percentChange: percentChange,
    });
  });

  updateChartPane();
});
socket.on("start new day", function (data) {
  // console.log("\nNewDay", data);

  //-- reset data w. the last data
  const removeCount = stockData.length - 4;
  stockData.splice(0, removeCount);
  stockData.forEach((item) => {
    //-- the last 4 items from previous day
    item.timestamp = data.timestamp + "";
    item.priceChange = 0;
    item.percentChange = 0;
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
      if (selectedTickers.length == 0) {
        hideChartPane();
      } else {
        redrawChartPane(selectedTickers);
      }
    });
  });
} //buildSelectPane

function buildChartPane(pTickers = selectedTickers) {
  // console.log("buildChartPane, pTickers ?? ", pTickers);

  let stockPCChart = {};
  let chartDiv, indicationHolder;

  buildInfo();
  updateInfo(pTickers);

  function buildInfo() {
    // console.log("buildChartPane, buildInfo");

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
    indicationHolder.innerHTML = tickers
      .map(
        (ticker) => `<div class="infoHolder" id="${ticker}-infoHolder">
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
  } //buildInfo
  function updateInfo(pTickers = selectedTickers) {
    // console.log("buildChartPane, updateInfo, pTickers? ", pTickers);
    if (pTickers.length == 0 || !pTickers) return;

    let dataByTicker = d3.group(stockData, (d) => d.ticker);
    let dataArr = pTickers.map((ticker) => dataByTicker.get(ticker));
    const lastIndex = dataArr[0].length - 1;

    chartDiv
      .querySelectorAll(".infoHolder")
      .forEach((holder) => holder.classList.add("hide"));
    //-- for each ticker
    pTickers.forEach((ticker, i) => {
      const infoHolder = document.getElementById(`${ticker}-infoHolder`);
      const changeInfoHolder = infoHolder.querySelector(".change-info");
      const priceChange = dataArr[i][lastIndex].priceChange;
      let sign = "+";
      changeInfoHolder.style.color = upColor;
      if (priceChange < 0) {
        sign = "-";
        changeInfoHolder.style.color = downColor;
      }
      infoHolder.classList.remove("hide");
      infoHolder.style.top = 60 * i + "px";
      infoHolder.querySelector(".price").textContent =
        "$" + formatNumber(dataArr[i][lastIndex].price);
      infoHolder.querySelector(".percent").innerHTML = `${sign}${formatNumber(
        Math.abs(dataArr[i][lastIndex].percentChange)
      )}<span>%</span>`;
      infoHolder.querySelector(".value").textContent =
        sign + "$" + formatNumber(Math.abs(priceChange));
    }); //pTickers
  } //updateInfo
  function showInfo() {
    // console.log("buildChartPane, showInfo");
    // indicationHolder.style.visibility = "visible";
    indicationHolder.classList.remove("hide");
  } //showInfo
  function hideInfo() {
    // console.log("buildChartPane, hideInfo");
    // indicationHolder.style.visibility = "hidden";
    indicationHolder.classList.add("hide");
  } //hideInfo

  let svg, lines, circles, rule, ruleLabel;
  let xScale, yScale, xValue, yValue; //TODO: zScale, zValue
  let xGrid, yGrid, xGridG, yGridG, xAxisB, xAxisT, yAxis;
  let xDate;
  buildChart(pTickers);

  function buildChart(pTickers = selectedTickers) {
    // console.log("buildChart, pTickers ?? ", pTickers);

    if (svg) d3.selectAll("svg").remove();

    svg = d3
      .select("#chartHolder")
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .on("mouseout", (e) => {
        //-- hide rule, ruleLabel, circles and texts that cross with the graph lines
        d3.select("#rule").style("opacity", "0");
        d3.select("#ruleLabel").style("opacity", "0");
        d3.selectAll(".mouse-per-line circle").style("opacity", "0");
        d3.selectAll(".mouse-per-line text").style("opacity", "0");
        d3.selectAll(".mouse-per-line rect").style("opacity", "0");
      })
      .on("mouseover", (e) => {
        //-- show rule, ruleLabel, circles and texts that cross with the graph lines
        d3.select("#rule").style("opacity", "1");
        d3.select("#ruleLabel").style("opacity", "1");
        d3.selectAll(".mouse-per-line circle").style("opacity", "1");
        d3.selectAll(".mouse-per-line text").style("opacity", "1");
        d3.selectAll(".mouse-per-line rect").style("opacity", "1");
      })
      .on("mousemove", (e) => {
        xDate = xScale.invert(d3.pointer(e)[0]);
        updateRuleInfo(xDate);
      });

    let domainData;
    let dataByTicker = d3.group(stockData, (d) => d.ticker);
    //-- depending on the number of ticker selection
    const chartType = pTickers.length <= 1 ? "price" : "change";
    xValue = (d) => d["timestamp"];
    if (chartType == "price") {
      yValue = (d) => d["price"];
      domainData = dataByTicker.get(pTickers[0]);
    } else {
      yValue = (d) => d["percentChange"];
      domainData = stockData;
    }

    //-- set ranges
    xScale = d3
      .scaleUtc()
      .domain(d3.extent(domainData, xValue))
      .range([0, innerWidth]);
    yScale = d3
      .scaleLinear()
      .domain(d3.extent(domainData, yValue))
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
        .attr("class", (d) => {
          if (d == 0) return "thickHline";
        })
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
        `translate(${margin.left + innerWidth - 5}, ${margin.top - 9})`
      );
    yAxis
      .call(
        d3
          .axisRight(yScale)
          .ticks(5)
          .tickFormat((d) => {
            if (chartType == "price") {
              return formatNumber(d);
            } else {
              return formatPercent(d) + "%";
            }
          })
      )
      .call((g) => g.select(".domain").remove());

    //-- draw graph line(s)
    if (lines && lines.length > 0) lines.forEach((line) => line.remove());
    if (circles && circles.length > 0)
      circles.forEach((circle) => circle.remove());
    lines = [];
    circles = [];
    pTickers.forEach((ticker) => {
      const selectedData = dataByTicker.get(ticker);
      const line = svg
        .append("g")
        .attr("id", `graph${ticker}`)
        .attr("transform", `translate(${margin.left}, ${margin.top})`)
        .append("path")
        .datum(selectedData)
        .attr(
          "d",
          d3
            .line()
            .curve(curve)
            .x((d) => xScale(d.timestamp))
            .y((d) => {
              if (chartType == "price") {
                return yScale(d.price);
              } else {
                return yScale(d.percentChange);
              }
            })
        )
        .attr("class", "line")
        .attr("stroke", colorMapping(ticker))
        .style("stroke-width", 2)
        .style("fill", "none");
      lines.push(line);

      //-- draw circles
      const lastXValue = xScale(xValue(selectedData[selectedData.length - 1]));
      const lastYValue = yScale(yValue(selectedData[selectedData.length - 1]));
      const circle = svg
        .append("g")
        .attr("id", `dotTip${ticker}`)
        .attr("transform", `translate(${margin.left}, ${margin.top})`)
        .append("circle");
      circle
        .attr("cx", lastXValue)
        .attr("cy", lastYValue)
        .attr("r", 5)
        .attr("stroke", "#fff")
        .style("stroke-width", 1)
        .style("fill", colorMapping(ticker));
      circles.push(circle);
    });

    //-- draw a vertical line (rule) for inspection
    rule = svg.append("g").attr("class", "mouse-over-effects");
    rule
      .append("line")
      .attr("id", "rule")
      .attr("class", "mouse-line")
      .attr("x1", margin.left)
      .attr("x2", margin.left)
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom + 8)
      .attr("stroke", "#000")
      .style("z-index", "10")
      .style("stroke-width", "1")
      .style("opacity", "0");

    //-- for showing time inspected
    ruleLabel = rule
      .append("text")
      .attr("id", "ruleLabel")
      .attr("class", "label")
      .attr("x", 6)
      .attr("y", margin.top - 2)
      .attr("fill", "#000")
      .attr("text-anchor", "right")
      .style("opacity", "0");

    pTickers.forEach((ticker) => {
      var mousePerLine = rule
        .append("g")
        .attr("class", `mouse-per-line ${ticker}`);
      mousePerLine
        .append("circle")
        .attr("cx", margin.left)
        .attr("cy", margin.top + 3)
        .attr("r", 3)
        .style("fill", colorMapping(ticker))
        .style("opacity", "0");
      mousePerLine
        .append("rect")
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("x", 26)
        .attr("y", 0)
        .attr("width", 48)
        .attr("height", 18)
        .style("fill", colorMapping(ticker))
        .style("opacity", "0");
      mousePerLine
        .append("text")
        .attr("x", 32)
        .attr("y", 0)
        .style("fill", "#fff")
        .text("");
    }); //pTickers
  } //buildChart
  function destroyChart() {
    if (svg) {
      d3.selectAll("svg").remove();
    }
  } //destroyChart
  function updateChart() {
    if (selectedTickers.length == 0) return;

    let domainData;
    let dataByTicker = d3.group(stockData, (d) => d.ticker);
    //-- depending on the number of ticker selection
    const chartType = selectedTickers.length <= 1 ? "price" : "change";
    xValue = (d) => d["timestamp"];
    if (chartType == "price") {
      yValue = (d) => d["price"];
      domainData = dataByTicker.get(selectedTickers[0]);
    } else {
      yValue = (d) => d["percentChange"];
      domainData = stockData;
    }

    //-- update scales
    xScale = d3
      .scaleUtc()
      .domain(d3.extent(domainData, xValue))
      .range([0, innerWidth]);
    yScale = d3
      .scaleLinear()
      .domain(d3.extent(domainData, yValue))
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
          .tickFormat((d) => {
            if (chartType == "price") {
              return formatNumber(d);
            } else {
              return formatPercent(d) + "%";
            }
          })
      )
      .call((g) => g.select(".domain").remove());

    //-- update graph line(s)
    selectedTickers.forEach((ticker, i) => {
      lines[i]
        .datum(dataByTicker.get(ticker))
        // .transition()
        // .duration(500)
        .attr(
          "d",
          d3
            .line()
            .x((d) => xScale(d.timestamp))
            .y((d) => {
              if (chartType == "price") {
                return yScale(d.price);
              } else {
                return yScale(d.percentChange);
              }
            })
        )
        .attr("stroke", colorMapping(ticker));

      //-- update the circle in the end of the graph line
      const selectedData = dataByTicker.get(ticker);
      const lastXValue = xScale(xValue(selectedData[selectedData.length - 1]));
      const lastYValue = yScale(yValue(selectedData[selectedData.length - 1]));
      circles[i]
        .attr("cx", lastXValue)
        .attr("cy", lastYValue)
        .style("fill", colorMapping(ticker));
    }); //selectedTickers
  } //updateChart
  function updateRuleInfo(date = xDate) {
    if (!date || !svg) return;

    var xPos = xScale(date);
    if (xPos > innerWidth || xPos <= 0) {
      rule.style("visibility", "hidden");
      return;
    }

    rule.style("visibility", "visible");
    rule.attr("transform", `translate(${xPos},0)`);
    ruleLabel.text(formatTime(date));

    const timeStamp = date.getTime();
    const tickers = selectedTickers;
    const dataByTicker = d3.group(stockData, (d) => d.ticker);
    const bisect = d3.bisector((d) => d.timestamp).center;
    const totalTickers = tickers.length;
    tickers.forEach((ticker) => {
      const dataArr = dataByTicker.get(ticker);
      const index = bisect(dataArr, timeStamp);
      const yVal =
        totalTickers <= 1
          ? "$" + formatNumber(dataArr[index].price)
          : formatPercent(dataArr[index].percentChange) + "%";
      const yPos =
        totalTickers <= 1
          ? yScale(dataArr[index].price) + margin.top
          : yScale(dataArr[index].percentChange) + margin.top;
      d3.selectAll(`.mouse-per-line.${ticker} text`)
        .attr("y", yPos + 3)
        .text(`${yVal}`);
      d3.selectAll(`.mouse-per-line.${ticker} rect`).attr("y", yPos - 10);
      d3.selectAll(`.mouse-per-line.${ticker} circle`).attr("cy", yPos);
    });
  } //updateRuleInfo

  stockPCChart.update = function () {
    // console.log("stockPCChart.update");
    updateInfo();
    updateChart();
    updateRuleInfo();
  }; //update
  stockPCChart.redraw = function (pTickers = selectedTickers) {
    // console.log("stockPCChart.redraw, pTickers?? ", pTickers);
    updateInfo(pTickers);
    showInfo();
    buildChart(pTickers);
  }; //redraw
  stockPCChart.hide = function () {
    // console.log("stockPCChart.hide");
    hideInfo();
    destroyChart();
  }; //hide

  return stockPCChart;
} //buildChartPane

//-- update on "market events"
function updateChartPane() {
  // console.log("updateChartPane");
  if (stockChart) stockChart.update();
} //updateCharPane

//-- redraw on ticker(checkbox) selection change
function redrawChartPane(pTickers = selectedTickers) {
  // console.log("redrawChartPane :: pTickers, ", pTickers);
  if (!stockChart) {
    stockChart = buildChartPane(pTickers);
  } else {
    stockChart.redraw(pTickers);
  }
} //redrawChartPane

//-- hide on no ticker selected
function hideChartPane() {
  // console.log("hideChartPane");
  stockChart.hide();
} //hideChartPane;
