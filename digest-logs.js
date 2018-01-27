/**
 *
 *
 **/

const url = require('url');
const fs = require('fs');
const path = require('path');

const async = require('async');
const highland = require('highland');

const keys = require('lodash/keys');

const AWS = require('aws-sdk');
AWS.config.update({
  region: "us-east-1",
});

const documentClient = new AWS.DynamoDB.DocumentClient();

const requestHash = {};
const resourceHash = {};

const parallelReads = 4;
const batchRateLimit = 2;
const dir = path.resolve(__dirname, 'logs');

console.log(`Processing directory '${dir}' for log entries ...`);
fs.readdir(dir, (e, files) => {
  async.filterSeries(files.sort(), (file, cb) => {
    const filePath = path.resolve(dir, file);
    const fileStream = fs.createReadStream(filePath);

    console.log(`Processing file '${filePath}' for log entries ...`);
    highland(fileStream)
      .split()
      .compact()
      .reduce([], parseLine)
      .tap((items) => console.log(`Persisting ${items.length} log entries ...`))
      .flatten()
      .ratelimit(batchRateLimit, 1000)
      .map(persistItem)
      .done(persistResourcesSummary);

  }, (err, validFiles) => {
    console.error(validFiles);  // print a list of all valid files
  });
});

function persistResourcesSummary() {
  console.log('Persisting summary of log entries ...');
  const resourceKeys = keys(resourceHash);
  highland(resourceKeys)
    .ratelimit(batchRateLimit, 1000)
    .map(persistResourceSummary)
    .done(() => console.log('Done persisting resource summaries.'));
}

function persistResourceSummary(resourceKey) {
  var params = {
    TableName: 'log-micro-service-summaries-dev',
    Item: resourceHash[resourceKey]
  }

  const putPromise = documentClient.put(params).promise();
  putPromise.then((data) => {
    //console.log("Put item:", JSON.stringify(data, null, 2));
  }).catch((err) => {
    console.error("Unable to put resource summary item:", JSON.stringify(err, null, 2));
  });

  return putPromise;
}

function persistItem(item) {
  var params = {
    TableName: 'log-micro-service-logs-dev',
    Item: item
  };

  const putPromise = documentClient.put(params).promise();
  putPromise.then((data) => {
    //console.log("Put item:", JSON.stringify(data, null, 2));
  }).catch((err) => {
    console.error("Unable to put log item:", JSON.stringify(err, null, 2));
  });

  return putPromise;
}

function parseRequestStart(id, line) {
  const requestStart = line.split(' ');
  const requestType = requestStart[2];
  const requestOrigin = requestStart[5];
  const requestDate = `${requestStart[7]}T${requestStart[8]}${requestStart[9]}`;

  const resourceURL = url.parse(requestStart[3].replace(/"/g, ''));
  const requestResource = resourceURL.href.replace(resourceURL.search, '').toLowerCase();
  const requestResourceQuery = (resourceURL.search) ? resourceURL.search.toLowerCase : undefined;

  return {
    id,
    requestDate,
    requestType,
    requestOrigin,
    requestResource,
    requestResourceQuery,
  };
}

function parseRequestEnd(line) {
  const requestEnd = line.split(' ');
  const responseStatus = requestEnd[2];
  const responseSuccess = responseStatus.startsWith('2');

  let responseDuration;
  const durationMatch = line.match(/(?<=in).*?(?=ms)/s);
  if (durationMatch) {
    responseDuration = parseInt(durationMatch[0]);
  }

  return {
    responseStatus,
    responseSuccess,
    responseDuration,
  }
}

function updateResource(resource, response) {
  if (!resource) {
    return {
      totalCount: 1,
      resource: response.requestResource,
      averageDuration: response.responseDuration,
      successCount: (response.responseSuccess) ? 1 : 0,
      failureCount: (response.responseSuccess) ? 0 : 1,
    }
  }

  const totalCount = resource.successCount + resource.failureCount;

  let averageDuration = response.averageDuration;
  if (response.responseDuration) {
    const totalDuration = totalCount * resource.averageDuration + response.responseDuration;
    averageDuration = totalDuration / (totalCount + 1);
  }

  const iterateSuccess = (response.responseSuccess) ? 1 : 0;
  const successCount = resource.successCount + iterateSuccess;

  const iterateFailure = (response.responseSuccess) ? 0 : 1;
  const failureCount = resource.failureCount + iterateFailure;

  return {
    resource: response.requestResource,
    totalCount: totalCount + 1,
    averageDuration,
    successCount,
    failureCount,
  }
}

// type, resource, origin, dateAndTime, responseStatus, duration
function parseLine(iterator, line) {
  const idMatch = line.match(/^\[(.*?)\]/);
  if (idMatch) {
    const id = idMatch[1];
    if (line.match(/Started/) && line.indexOf("/assets/") === -1) {
      requestHash[id] = parseRequestStart(id, line);
    } else if (line.match(/Completed/)) {
      const response = Object.assign({}, requestHash[id], parseRequestEnd(line));
      iterator.push(response);
      delete requestHash[id];

      const resource = resourceHash[response.requestResource];
      resourceHash[response.requestResource] = updateResource(resource, response);
    }
  }

  return iterator;
}
