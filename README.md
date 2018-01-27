# log-digest
Snippet script for digesting the log sample and streaming it to the appropriate DynamoDB instance.

## Setup
To run this script you must have node installed before leveraging npm to install the appropriate dependencies to. 
These dependencies are as follows at this time:
* async
* aws-sdk
* highland
* lodash

## Running
Peform the following terminal command from the project's root directory to execute the script against the given sample:
node digest-logs.js
