// window.onload = (e) => {
// const container = document.getElementById("container");
// console.log("container?", container);
// };

const container = document.getElementById("container");
console.log("container?", container);

//-- load historical data
d3.csv("/market-history", (error, data) => {
  // console.log("INFO index.js :: History (market-history)", error || data);
});

//-- subscribe to updates
const socket = io();
socket.on("market events", function (data) {
  // console.log("INFO index.js :: market events, Change", data);
});
socket.on("start new day", function (data) {
  // console.log("INFO index.js :: start new day, NewDay", data);
});
