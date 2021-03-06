const {admin,db} = require('../util/admin');
const config = require('../util/config');
const firebase = require('firebase');
firebase.initializeApp(config);

const {validateSignUpData, validateLogInData, reduceUserDetails} = require('../util/validators');

//Signup
exports.signup = (req, res) => {
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle,
    };
    
    const {valid, errors} = validateSignUpData(newUser);

    if(!valid ) return res.status(400).json(errors);
    
    const noImg = 'no-img.png';

    let token, userId;
    db.doc(`/users/${newUser.handle}`).get()
      .then(doc => {
        if (doc.exists) {
         return res.status(400).json({ handle: 'this handle is already taken!' });
        } else {
         return firebase
           .auth()
           .createUserWithEmailAndPassword(newUser.email, newUser.password)
        }
     })
     .then((data) => {
         userId = data.user.uid;
         return data.user.getIdToken(); 
     })
     .then((idToken) => {
         token = idToken;
         const userCredentials = {
             handle: newUser.handle,
             email: newUser.email,
             createdAt: new Date().toISOString(),
             resumeUrl: " ",
             imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
             userId 
         };
         return db.doc(`/users/${newUser.handle}`).set(userCredentials);
     })
     .then(() => {
        return res.status(201).json({token, message: "Successful sign up"});
     })
     .catch((err) => {
         console.error(err);
         if(err.code === 'auth/email-already-in-use'){
             return res.status(400).json({email: 'Email is already in use'})
         } else {
              return res.status(500).json({error: err.code}); 
         }
        
     });
}


//Login 
exports.login = (req, res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    }

    const {valid, errors} = validateLogInData(user);

    if(!valid ) return res.status(400).json(errors);

    firebase.auth().signInWithEmailAndPassword(user.email, user.password)
      .then(data => {
          return data.user.getIdToken();
      })
      .then(token => {
          return res.json({token, message: "Logged in successfully"});
      })
      .catch(err => {
          console.error(err);
          if(err.code === "auth/wrong-password"){
              res.status(403).json({general: 'Wrong credentials please try again'})
          }else {
               return res.status(500).json({error: err.code});
          }
         
      });
};

//Add User Profile Details Details
exports.addUserDetails = (req, res) => {

    let userDetails = reduceUserDetails(req.body);

    db.doc(`/users/${req.user.handle}`).update(userDetails)
      .then(() => {
          return res.json({message: 'Details were added successfully'}); 
      })
      .catch(err => {
          console.error(err);
          return res.status(500).json({error: err.code});
      });
};

//Upload User Profile Image
exports.uploadImage = (req, res) => {
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    const busboy = new BusBoy({ headers: req.headers});

    let imageFileName;
    let imageToBeUploaded= {}; 

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        if(mimetype !== 'image/jpeg' && mimetype != 'image/png'){
            return res.status(400).json({error: 'Wrong file type submitted'});
        }
        const imageExtension = filename.split('.')[filename.split('.').length - 1];
        imageFileName = `${Math.round(Math.random()*1000000000)}.${imageExtension}`;
        const filePath = path.join(os.tmpdir(), imageFileName);
        imageToBeUploaded= {filePath, mimetype};
        file.pipe(fs.createWriteStream(filePath));
    });
    busboy.on('finish', () => {
        admin.storage().bucket().upload(imageToBeUploaded.filePath, {
            resumable: false,
            metadata: {
                metadata: {
                    contentType: imageToBeUploaded.mimetype
                }
            }
        })
        .then(() => {
            const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
            return db.doc(`/users/${req.user.handle}`).update({imageUrl});
        })
        .then(() => {
            return res.json({message: 'Image uploaded successfully'});
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({error: err.code});
        });
    });
    busboy.end(req.rawBody);
};

exports.getTheImage = (req, res) => {
    db.doc(`/users/${req.user.handle}`).get().then(function(doc) {
      if (doc.exists) {
        userData = doc.data();
        userImage = userData.imageUrl;
        userHandle = userData.handle;
        return res.json({img: userImage, handle: userHandle});
      } else {
        res.status(500).json({ error: "No such document!" });
      }});
  };


//Upload Resume 
exports.uploadResume = (req, res) => {
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    const busboy = new BusBoy({ headers: req.headers});

    let resumeFileName;
    let resumeToBeUploaded= {}; 

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        //TODO: Check for a pdf file type
       // if(mimetype !== 'file/pdf'){
       //     return res.status(400).json({error: 'Wrong file type submitted'});
       // }
        const resumeExtension = filename.split('.')[filename.split('.').length - 1];
        resumeFileName = `${Math.round(Math.random()*1000000000)}.${resumeExtension}`;
        const filePath = path.join(os.tmpdir(), resumeFileName);
        resumeToBeUploaded= {filePath, mimetype};
        file.pipe(fs.createWriteStream(filePath));
    });
    busboy.on('finish', () => {
        admin.storage().bucket().upload(resumeToBeUploaded.filePath, {
            resumable: false,
            metadata: {
                metadata: {
                    contentType: resumeToBeUploaded.mimetype
                }
            }
        })
        .then(() => {
            const resumeUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${resumeFileName}?alt=media`;
            return db.doc(`/users/${req.user.handle}`).update({resumeUrl});
        })
        .then(() => {
            return res.json({message: 'Resume uploaded successfully'});
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({error: err.code});
        });
    });
    busboy.end(req.rawBody);

}