const express = require('express')
const app = express()
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null
const initializationServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3005, () => {
      console.log(`Server Running at http://localhost:3005/`)
    })
  } catch (e) {
    console.log(`DB error : '${e.message}'`)
    process.exit(1)
  }
}

initializationServer()

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUser = `
    SELECT * FROM user WHERE username = '${username}';`
  const userDetails = await db.get(getUser)

  if (userDetails !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(request.body.password, 10)
      const registerUser = `
          INSERT INTO user (name, username, password, gender) 
          VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');`
      await db.run(registerUser)
      response.status(200)
      response.send('User created successfully')
    }
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserExist = `
    SELECT * FROM user WHERE username = '${username}';`
  const userExistDetails = await db.get(getUserExist)

  if (userExistDetails === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userExistDetails.password,
    )
    if (isPasswordCorrect) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const verifyToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

const getId = async (request, response, next) => {
  const {username} = request.params
  const getUserIdName = `
    SELECT user_id
    FROM user 
    WHERE username = '${username}';
    `
  const userIdNameDetails = await db.get(getUserIdName)
  const {user_id} = userIdNameDetails
  request.user_id = user_id
  next()
}

app.get('/user/tweets/feed/', verifyToken, getId, async (request, response) => {
  const {user_id} = request
  const getTweets = `
  SELECT user.username AS username, T.tweet AS tweet, T.date_time AS dateTime
  FROM (follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS T
  INNER JOIN user ON T.following_user_id = user.user_id 
  WHERE T.follower_user_id = ${user_id}
  ORDER BY dateTime DESC
  LIMIT 4;`

  const tweetsList = await db.all(getTweets)
  response.send(tweetsList)
})

app.get('/user/following/', verifyToken, getId, async (request, response) => {
  const {user_id} = request
  const getFollowing = `
    SELECT user.username AS name
    FROM follower INNER JOIN user ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id= ${user_id};`
  const followingDetails = await db.all(getFollowing)
  response.send(followingDetails)
})

app.get('/user/followers/', verifyToken, getId, async (request, response) => {
  const {user_id} = request
  const getFollower = `
    SELECT user.username AS name
    FROM follower 
    INNER JOIN user ON follower.follower_user_id = user.user_id
    WHERE follower.following_user_id = ${user_id};`
  const followerDetails = await db.all(getFollower)
  response.send(followerDetails)
})

const verifyTweetId = async (request, response, next) => {
  const {tweetId, username} = request.params
  const getUserId = `
      SELECT user.username AS username
      FROM tweet 
      INNER JOIN user ON tweet.user_id = user.user_id
      WHERE tweet.tweet_id = ${tweetId};`
  const detailsUserId= await db.get(getUserId);

  if (username ===detailsUserId.username) {
    next()
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
}

app.get('/tweets/:tweetId/', verifyToken, verifyTweetId, async (request, response) => {
    const {tweetId} = request.params
    const getTweetDetails = `
      SELECT T.tweet AS tweet, COUNT(like.like_id) AS likes, COUNT(T.reply_id) AS replies, T.date_time AS dateTime
      FROM (tweet 
      INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T 
      INNER JOIN like ON T.tweet_id = like.tweet_id 
      WHERE T.tweet_id= ${tweetId};`
    const tweetDetails = await db.get(getTweetDetails)
    response.send(tweetDetails)
  })

app.get('/tweets/:tweetId/likes/', verifyToken, verifyTweetId, async (request, response) => {
    const {tweetId} = request.params
    const getTweetLikes = `
      SELECT user.usernames AS username
      FROM like 
      INNER JOIN user ON like.user_id = user.user_id
      WHERE like.tweet_id= ${tweetId};`
    const tweetLikesDetails = await db.get(getTweetLikes)
    response.send(tweetLikesDetails)
  })

app.get('/tweets/:tweetId/replies/', verifyToken, verifyTweetId, async (request, response) => {
    const {tweetId} = request.params
    const getTweetReplies = `
      SELECT user.usernames AS username, reply.reply AS reply
      FROM reply 
      INNER JOIN user ON reply.user_id = user.user_id
      WHERE reply.tweet_id= ${tweetId};`
    const tweetRepliesDetails = await db.get(getTweetReplies)
    response.send(tweetRepliesDetails)
  })

app.get('/user/tweets/', verifyToken, async (request, response) => {
  const {username} = request.params
  const allTweets = `
    SELECT Q.tweet AS tweet, COUNT(like.like_id) AS likes, COUNT(Q.reply) AS replies, Q.date_time AS dateTime
    FROM ((user 
    INNER JOIN tweet ON user.user_id=tweet.user_id) AS T 
    INNER JOIN reply ON T.tweet_id = reply.tweet_id) AS Q 
    INNER JOIN like ON Q.user.tweet_id = like.tweet_id
    WHERE Q.username='${username}';`
  const allTweetsDetails = await db.all(allTweets)
  response.send(allTweetsDetails)
})

app.post('/user/tweets/', verifyToken, async (request, response) => {
  const {tweet} = request.body
  const {username} = request.params
  var currentDate = new Date()

  // Get various components of the current date and time
  var year = currentDate.getFullYear()
  var month = currentDate.getMonth() + 1 // Month is zero-based, so add 1
  var day = currentDate.getDate()
  var hours = currentDate.getHours()
  var minutes = currentDate.getMinutes()
  var seconds = currentDate.getSeconds()

  var formattedDateTime =
    year +
    '-' +
    addZeroPadding(month) +
    '-' +
    addZeroPadding(day) +
    ' ' +
    addZeroPadding(hours) +
    ':' +
    addZeroPadding(minutes) +
    ':' +
    addZeroPadding(seconds)
  const getUserdet = `
    SELECT user_id 
    FROM user 
    WHERE username ='${username}';`
  const userId = await db.get(getUserdet)
  const {user_id} = userId

  const postTweet = `
    INSERT INTO tweet (tweet, user_id, date_time)
    VALUES ('${tweet}', ${user_id}, ${formattedDateTime});`
  await db.run(postTweet)
  response.send('Created a Tweet')
})

app.delete('/tweets/:tweetId/', verifyToken, verifyTweetId, async (request, response) => {
    const {tweetId} = request.params
    const deleteTweet = `
      DELETE FROM tweet 
      WHERE tweet_id= ${tweetId};`
    await db.run(deleteTweet)
    response.send('Tweet Removed')
  })

module.exports = app
