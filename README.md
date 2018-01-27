# log-digest
Snippet script for digesting the log sample and streaming it to the appropriate DynamoDB instance.

## Setup
To run this script you must have node installed before leveraging npm to install the appropriate dependencies to. 
These dependencies are as follows at this time:
* async
* aws-sdk
* highland
* lodash

IMPORTANT: The following AWS DynamoDB tables should be in place prior to running this digestion script and may be first created by first performing the severless deployment of the `log-micro-service`.

## Running
Peform the following terminal command from the project's root directory to execute the script against the given sample:
```
node digest-logs.js
```

