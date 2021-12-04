import "index.html";
import "style.css";
import "favicon.ico";
import io from "socket.io-client";
import { csv } from "d3-request";
// import { utcDay, utcMinute } from "d3-time";
import { utcFormat } from "d3-time-format";

//-- dimensions
const width = 750;
const height = 600;
const margin = { top: 30, right: 100, bottom: 30, left: 20 },
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
// const curve = d3.curveLinear;
const tickers = ["AAPL", "GOOGL", "FB", "MSFT"];
const colors = ["#1f77b4", "#9467bd", "#ff7f02", "#8c564b"];
const upColor = "#2ca02c";
const downColor = "#d62728";

//-- load historical data
const col = (d) => {
  d.utcTime = formatTime(d.timestamp);
  d.price = +d.price;
  return d;
};
csv("/market-history", col, (error, data) => {
  if (error) {
    contentDiv.textContent = error.target.response;
    return;
  }
  //-- {timestamp: '1638351000000', ticker: 'AAPL', price: '119.25', utcTime: '09:30'}
  const dataByTicker = d3.group(data, (d) => d.ticker);
  buildCharts(dataByTicker);
});

//-- subscribe to updates
const socket = io();
socket.on("market events", function (data) {
  console.log("Change", data);
});
socket.on("start new day", function (data) {
  console.log("NewDay", data);
});

function buildCharts(data) {
  contentDiv.textContent = ""; //-- clear
  buildChart1(data);
  buildChart2(data);
}

function buildChart1(dataByTicker) {
  console.log("index.js :: buildChart1, dataByTicker?? ", dataByTicker);

  chartDiv1 = contentDiv.appendChild(document.createElement("div"));
  chartDiv1.setAttribute("id", "chartDiv1");
  chartDiv1.setAttribute("class", "chartDiv");
  chartDiv1.innerHTML = `
    <div class="chartHolder" id="chartHolder1"></div>
    <div class="indicationHolder" id="indicationHolder1">
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
  `;
  chartHolder1 = document.getElementById("chartHolder1");
  indicationHolder1 = document.getElementById("indicationHolder1");
  let tickerInfo = chartDiv1.querySelector(".ticker-info");
  let tickerBlock = chartDiv1.querySelector(".ticker-info .block");
  let changeInfo = chartDiv1.querySelector(".change-info");

  tickerSelection = chartDiv1.appendChild(document.createElement("select"));
  tickerSelection.setAttribute("id", "tickerSelection");
  d3.select("#tickerSelection")
    .selectAll("myOptions")
    .data(tickers)
    .enter()
    .append("option")
    .text((d) => d)
    .attr("value", (d) => d);

  const svg = d3
    .select("#chartHolder1")
    .append("svg")
    .attr("width", width)
    .attr("height", height + margin.top + margin.bottom) /* TODO */
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  let selectedIndex = 0;
  let selectedTicker = tickers[selectedIndex];
  let selectedColor = colors[selectedIndex];
  let selectedData = dataByTicker.get(tickers[selectedIndex]);

  //-- info color
  tickerInfo.style.color = selectedColor;
  tickerBlock.style.backgroundColor = selectedColor;

  //-----------------------------//
  //-------- init chart ---------//
  //-----------------------------//
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

  //-- set grids
  let xGrid = (g) =>
    g
      .attr("class", "vline")
      .selectAll("line")
      .data(xScale.ticks(10))
      // .data(xScale.ticks())
      .join("line")
      .attr("x1", (d) => xScale(d))
      .attr("x2", (d) => xScale(d))
      .attr("y1", margin.top - 8) /*margin.top*/
      .attr("y2", height - margin.bottom + 8); /*margin.bottom*/
  let yGrid = (g) =>
    g
      .attr("class", "hline")
      .selectAll("line")
      .data(yScale.ticks(5))
      .join("line")
      .attr("x1", 0) /* margin.left(yaxis loc) - margin.left) */
      .attr("x2", width - margin.right + 50)
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
      `translate(${margin.left}, ${height - margin.top + 10})`
    );
  xAxisB
    .call(d3.axisBottom(xScale).ticks(10).tickFormat(formatTime))
    .call((g) => g.select(".domain").remove());

  let xAxisT = svg
    .append("g")
    .attr("id", "xAxisT")
    .attr("class", "xAxis")
    .attr("transform", `translate(${margin.left}, ${margin.top - 10})`);
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
      `translate(${margin.left + innerWidth}, ${margin.top - 10})`
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

  updateInfo(selectedIndex);

  function update(index) {
    selectedIndex = index;
    selectedData = dataByTicker.get(tickers[index]);
    selectedTicker = tickers[index];
    selectedColor = colors[index];

    updateChart(index);
    updateInfo(index);
  }

  function updateChart(index) {
    // xScale = d3.domain(d3.extent(selectedData, xValue));
    // yScale = d3.domain(d3.extent(selectedData, yValue));

    xScale = d3
      .scaleUtc()
      .domain(d3.extent(selectedData, xValue))
      .range([0, innerWidth]);
    yScale = d3
      .scaleLinear()
      .domain(d3.extent(selectedData, yValue))
      .range([innerHeight, 0]);

    xGridG.call(xGrid);
    yGridG.call(yGrid);

    xAxisB
      .call(d3.axisBottom(xScale).ticks(10))
      .call((g) => g.select(".domain").remove());
    xAxisT
      .call(d3.axisTop(xScale).ticks(10))
      .call((g) => g.select(".domain").remove());

    yAxis
      .call(d3.axisRight(yScale).ticks(5).tickFormat(d3.format(".2f")))
      .call((g) => g.select(".domain").remove());

    line
      .datum(selectedData)
      .transition()
      .duration(750)
      .attr("stroke", selectedColor)
      .attr(
        "d",
        d3
          .line()
          .x((d) => xScale(d.timestamp))
          .y((d) => yScale(d.price))
      );
  }

  function updateInfo(index) {
    tickerInfo.style.color = selectedColor;
    tickerBlock.style.backgroundColor = selectedColor;

    var firstPrice = selectedData[0].price;
    var lastPrice = selectedData[selectedData.length - 1].price;
    var priceChange = Math.round((lastPrice - firstPrice) * 100) / 100;
    var percentChange = Math.round((priceChange / firstPrice) * 10000) / 100;
    var sign = priceChange == 0 ? "" : "+";
    changeInfo.style.color = upColor;
    if (priceChange < 0) {
      sign = "-";
      changeInfo.style.color = downColor;
    }
    lastPrice = Math.round(lastPrice * 100) / 100;
    chartDiv1.querySelector(".ticker").textContent = selectedTicker;
    indicationHolder1.querySelector(".price").textContent = "$" + lastPrice;
    indicationHolder1.querySelector(".percent").innerHTML = `${sign}${Math.abs(
      percentChange
    )}<span>%</span>`;
    indicationHolder1.querySelector(".value").textContent =
      sign + "$" + Math.abs(priceChange);
  }

  //-- when the button is changed, run the update function
  d3.select("#tickerSelection").on("change", (e) =>
    update(e.target.selectedIndex)
  );
}

function buildChart2(dataByTicker) {
  // console.log("index.js :: buildChart2, dataByTicker? " + dataByTicker);
}
