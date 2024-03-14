const express = require("express");
const PORT = 3000;
const app = express();

const multer = require("multer");
const AWS = require("aws-sdk");
require("dotenv").config();
const path = require("path");
// const { ConfigurationServicePlaceholders } = require("aws-sdk/lib/config_service_placeholders");

process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1";

AWS.config.update({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMO_TABLE_NAME;

const storage = multer.memoryStorage({
  destination(req, file, callback) {
    callback(null, "");
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2000000 },
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
});

function checkFileType(file, cb) {
  const fileTypes = /jpeg|jpg|png/;
  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  }
  return cb("Error check type: png, jpeg, jpg only");
}

app.get("/", async (req, res) => {
  try {
    const params = { TableName: tableName };
    const data = await dynamodb.scan(params).promise();
    console.log("data=", data.Items);
    return res.render("index.ejs", { data: data.Items });
  } catch (error) {
    console.log("Error", error);
    return res.status(500).send("Inter Server Error");
  }
});
app.post("/save", upload.single("image"), (req, res) => {
  try {
    const maSanPham = req.body.maSanPham;
    const tenSanPham = req.body.tenSanPham;
    const soLuong = Number(req.body.soLuong);

    const image = req.file?.originalname.split(".");
    const fileType = image[image.length - 1];
    const filePath = `${maSanPham}_${Date.now().toString()}.${fileType}`;
    const paramS3 = {
      Bucket: bucketName,
      Key: filePath,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    s3.upload(paramS3, async (err, data) => {
      if (err) {
        console.error("error=", err);
        return res.send("Internal server error !");
      } else {
        const imageURL = data.Location;
        const paramsDynamoDb = {
          TableName: tableName,
          Item: {
            id: maSanPham,
            tenSanPham: tenSanPham,
            soLuong: soLuong,
            image: imageURL,
          },
        };
        await dynamodb.put(paramsDynamoDb).promise();
        return res.redirect("/");
      }
    });
  } catch (error) {
    console.error("Error save !");
    return res.status(500).send("Internal server error");
  }
});

app.post("/delete", upload.fields([]), (req, res) => {
  const listCheckboxSelected = Object.keys(req.body);
  console.log(listCheckboxSelected);
  if (!listCheckboxSelected || listCheckboxSelected.length <= 0) {
    return res.redirect("/");
  }
  try {
    function onDeleteItem(length) {
      const params = {
        TableName: tableName,
        Key: {
          id: listCheckboxSelected[length],
        },
      };
      dynamodb.delete(params, (err, data) => {
        if (err) {
          console.error("error=", err);
          return res.send("Internal server Error");
        } else if (length > 0) onDeleteItem(length - 1);
        else return res.redirect("/");
      });
    }
    onDeleteItem(listCheckboxSelected.length - 1);
  } catch (error) {
    console.error("Error delete !", error);
    return res.status(500).send("Internal server error");
  }
});

app.listen(PORT, () => {
  console.log("server is running on PORT: " + PORT);
});

app.set("view engine", "ejs");
app.set("views", "./view");
