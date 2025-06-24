FROM node:lts-alpine

# Create app directory
WORKDIR /usr/src/app

# Install global dependencies
RUN npm install -g @acala-network/chopsticks@latest

# Default to running chopsticks CLI
CMD ["chopsticks"]
