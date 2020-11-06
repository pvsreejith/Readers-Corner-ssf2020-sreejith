//load resources
const express = require('express')
const handlebars = require('express-handlebars')
// get the driver with promise support
const mysql = require('mysql2/promise')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
const morgan = require('morgan')


// SQL 
const SQL_FIND_BY_LETTER = 'select * from book2018 where title like ? order by title limit ? offset ?'

const SQL_FIND_BY_BOOK_ID = 'select * from book2018 where book_id = ?'


// configure PORT
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000;

// create the database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'goodreads',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 4,
    timezone: '+08:00'
})

const startApp = async (app, pool) => {

    try {
        // acquire a connection from the connection pool
        const conn = await pool.getConnection();

        console.info('Pinging database...')
        await conn.ping()

        // release the connection
        conn.release()

        // start the server
        app.listen(PORT, () => {
            console.info(`Application started on port ${PORT} at ${new Date()}`)
        })

    } catch(e) {
        console.error('Cannot ping database: ', e)
    }
}

// create an instance of application
const app = express()

app.use(morgan('combined'))

// configure handlebars
app.engine('hbs', handlebars({ defaultLayout: 'default.hbs' }))
app.set('view engine', 'hbs')

// configure the application
app.get('/', (req, resp) => {
    resp.status(200)
    resp.type('text/html')
    resp.render('index')
})


app.get('/search', 
    async (req, resp) => {
        const q = req.query['q'];
        const offset = parseInt(req.query['offset']) || 0
        const limit = 10

        // acquire a connection from the pool
        let conn, recs;

        try {
            conn = await pool.getConnection()
			  
            //  select * from book2018 where title like ? limit ?
            result = await conn.query(SQL_FIND_BY_LETTER, [ `${q}%`, limit, offset ])
            recs = result[0];

        } catch(e) {
			  resp.status(500)
			  resp.type('text/html')
			  resp.send('<h2>Error</h2>' + e)
        } finally {
            // release connection
            if (conn)
                conn.release()
        }

        resp.status(200)
        resp.type('text/html')
        resp.render('results', 
            { 
                result: recs, 
                hasResult: recs.length > 0,
                q: q,
                prevOffset: Math.max(0, offset - limit),
                nextOffset: offset + limit
            }
        )
    }
)

app.get('/book/:bookId', async (req, resp) => {

	const bookId = req.params.bookId

	const conn = await pool.getConnection()

	try {
        const [ result, _ ] = await conn.query(SQL_FIND_BY_BOOK_ID, [ bookId ])
        
        const books = result[0]
        result[0].genres = books.genres.replace(/\|/g, ',')
        result[0].authors = books.authors.replace(/\|/g, ',')

		resp.status(200)
		resp.type('text/html')
		resp.render('book', { book: result[0], hasSite: !!result[0].official_site })
	} catch(e) {
		console.error('ERROR: ', e)
		resp.status(500)
		resp.end()
	} finally {
		conn.release()
	}
})


startApp(app, pool)


const API_KEY = process.env.API_KEY || "";
const NYTAPI_URL = 'https://api.nytimes.com/svc/books/v3/reviews.json'


app.get('/findreview', 
    async (req, resp) => {
        const search = req.query['title']
      

        // construct the url with the query parameters
        const url = withQuery(NYTAPI_URL, {            
            title: search,
            'api-key': API_KEY,
            headers: {
                'Content-Type': 'application/jason',
                'Content-Type': 'text/html'
              }
        })


        console.info(url)

        const result = await fetch(url)
        const review = await result.json()

        const reviewArray = review.results
                    .map( d => {
                    return { booktitle: d.book_title,
                            author : d.book_author ,
                            reviewer : d.byline,
                            date : d.publication_dt,
                            link : d.summary,  
                            url : d.url                                           
                    }
                }
            )

     resp.status(200)
        resp.type('text/html')
        lengthArray = reviewArray.length
        resp.render('review', {
            search, reviewArray: reviewArray,lengthArray,
            hasContent: lengthArray > 0
            
        })
    }
)

