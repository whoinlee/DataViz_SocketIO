import "index.html";
import "style.css";
import "favicon.ico";
import io from "socket.io-client";
import { csv } from "d3-request";
// import { extent } from "d3";
import { utcDay, utcMinute } from "d3-time";
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

//-- load historical data
const col = (d) => {
  d.utcTime = formatTime(utcMinute(d.timestamp));
  d.price = +d.price;
  return d;
};
csv("/market-history", col, (error, data) => {
  if (error) {
    contentDiv.textContent = error.target.response;
    return;
  }
  //-- {timestamp: '1638351000000', ticker: 'AAPL', price: '119.25', utcTime: '09:30'}
  buildCharts(data);
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

function buildChart1(data) {
  chartDiv1 = contentDiv.appendChild(document.createElement("div"));
  chartDiv1.setAttribute("id", "chartDiv1");
  chartDiv1.setAttribute("class", "chartDiv");
  chartDiv1.innerHTML = `
    <div class="chartHolder" id="chartHolder1"></div>
    <div class="indicationHolder" id="indicationHolder1">
      <div class="ticker-info aapl">
        <div class="block aapl"></div>
        <div class="category">
            <div class="ticker">AAPL</div>
            <div class="price">$123.67</div>
        </div>
      </div>
      <div class="change-info up">
        <div class="percent">+0.86<span>%</span></div>
        <div class="value">+$1.05</div>
      </div>
    </div>
  `;
  chartHolder1 = document.getElementById("chartHolder1");
  indicationHolder1 = document.getElementById("indicationHolder1");

  tickerSelection = chartDiv1.appendChild(document.createElement("select"));
  tickerSelection.setAttribute("id", "tickerSelection");
  d3.select("#tickerSelection")
    .selectAll("myOptions")
    .data(tickers)
    .enter()
    .append("option")
    .text((d) => d)
    .attr("value", (d) => d);

  const dataByTicker = d3.group(data, (d) => d.ticker); //-- a Map grouped by ticker
  // console.log("index.js :: buildChart1, dataByTicker?? ", dataByTicker);
  // const color = d3.scaleOrdinal().domain(tickers).range(colors);

  const svg = d3
    .select("#chartHolder1")
    .append("svg")
    .attr("width", width)
    .attr("height", height + margin.top + margin.bottom) /* TODO */
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xValue = (d) => d["timestamp"];
  const yValue = (d) => d["price"];

  let selectedIndex = 0;
  let selectedTicker = tickers[selectedIndex];
  let selectedColor = colors[selectedIndex];
  let selectedData = dataByTicker.get(tickers[selectedIndex]);
  initChart();
  updateChart(selectedIndex);
  updateInfo(selectedIndex);

  function initChart() {}
  function updateChart(index) {
    console.log("drawChart???, " + index);
    console.log("drawChart???, selectedData? " + selectedData);

    //-- set ranges
    const x = d3
      .scaleUtc()
      .domain(d3.extent(selectedData, xValue))
      .range([0, innerWidth]);
    // .nice();
    const xScale = x;

    const y = d3
      .scaleLinear()
      .domain(d3.extent(selectedData, yValue))
      .range([innerHeight, 0]);
    // .nice();
    const yScale = y;

    const xGrid = (g) =>
      g
        .attr("class", "vline")
        .selectAll("line")
        .data(xScale.ticks())
        .join("line")
        .attr("x1", (d) => xScale(d))
        .attr("x2", (d) => xScale(d))
        .attr("y1", margin.top - 20) /*margin.top*/
        .attr("y2", height - margin.bottom + 20); /*margin.bottom*/

    const yGrid = (g) =>
      g
        .attr("class", "hline")
        .selectAll("line")
        .data(yScale.ticks(4))
        .join("line")
        .attr("x1", 0) /* margin.left(yaxis loc) - margin.left) */
        .attr("x2", width - margin.right + 50)
        .attr("y1", (d) => yScale(d))
        .attr("y2", (d) => yScale(d));

    //-- add the X gridlines, v-lines to the x-direction
    svg
      .append("g")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(xGrid);

    //-- add the Y gridlines, h-lines to the y-direction
    svg
      .append("g")
      .attr("transform", `translate(0, ${margin.top})`)
      .call(yGrid);

    //-- add X axis
    svg
      .append("g")
      .attr("id", "xAxis")
      .attr("transform", `translate(${margin.left}, ${height - margin.top})`)
      .call(d3.axisBottom(xScale));
    // .innerTickSize(0);

    //-- add Y axis
    svg
      .append("g")
      .attr("id", "yAxis")
      .attr("transform", `translate(${margin.left}, ${margin.top})`)
      .call(d3.axisLeft(yScale));
    // .outerTickSize(0);

    //-- initialize line with group a
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
  }

  function updateInfo(index) {
    console.log("updateInfo???, " + index);
    console.log("updateInfo???, selectedData? " + selectedData);
    var firstPrice = selectedData[0].price;
    var lastPrice = selectedData[selectedData.length - 1].price;
    var priceChange = Math.round((lastPrice - firstPrice) * 100) / 100;
    var percentChange = Math.round((priceChange / firstPrice) * 10000) / 100;
    var sign = priceChange == 0 ? "" : "+";
    var changeInfo = chartDiv1.querySelector(".change-info");
    changeInfo.classList.remove("down");
    changeInfo.classList.add("up");
    if (priceChange < 0) {
      sign = "-";
      changeInfo.classList.add("down");
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

  //-- a function that update the chart
  function update(index) {
    selectedData = dataByTicker.get(tickers[index]);
    selectedTicker = tickers[index];
    selectedColor = colors[index];

    const prevTickerClass = selectedTicker.toLowerCase();
    selectedTicker = tickers[index];
    const currTickerClass = selectedTicker.toLowerCase();
    //
    const tickerInfo = chartDiv1.querySelector(".ticker-info");
    const tickerBlock = chartDiv1.querySelector(".block");
    tickerInfo.classList.remove(prevTickerClass);
    tickerBlock.classList.remove(prevTickerClass);
    tickerInfo.classList.add(currTickerClass);
    tickerBlock.classList.add(currTickerClass);

    updateChart(index);
    updateInfo(index);
  }

  //-- when the button is changed, run the update function
  d3.select("#tickerSelection").on("change", (e) => {
    selectedIndex = e.target.selectedIndex;
    update(selectedIndex);
  });
}

function buildChart2(data) {
  // console.log("index.js :: buildChart2, data? " + data);
}
