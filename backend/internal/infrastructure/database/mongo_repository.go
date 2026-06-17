package database

import (
	"context"
	"errors"
	"fmt"

	"ff-dashboard-mgmt/backend/internal/domain"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type mongoRepository struct {
	client *mongo.Client
	dbName string
}

func NewMongoRepository(client *mongo.Client, dbName string) domain.MongoRepository {
	return &mongoRepository{
		client: client,
		dbName: dbName,
	}
}

// ── iotRegistedIMEI CRUD ─────────────────────────────────────────────────────

func (r *mongoRepository) ListRegistrations(ctx context.Context) ([]*domain.MongoDeviceRegistered, error) {
	coll := r.client.Database(r.dbName).Collection("iotRegistedIMEI")
	cursor, err := coll.Find(ctx, bson.M{})
	if err != nil {
		return nil, fmt.Errorf("mongo: list registrations: %w", err)
	}
	defer cursor.Close(ctx)

	var list []*domain.MongoDeviceRegistered
	for cursor.Next(ctx) {
		var doc domain.MongoDeviceRegistered
		var raw bson.M
		if err := cursor.Decode(&raw); err != nil {
			continue
		}

		if oid, ok := raw["_id"].(primitive.ObjectID); ok {
			doc.ID = oid.Hex()
		} else if s, ok := raw["_id"].(string); ok {
			doc.ID = s
		}

		doc.AccountID = getStrVal(raw, "accountId")
		doc.Imei = getStrVal(raw, "imei", "IMEI")
		doc.StationID = getStrVal(raw, "station", "station_id")
		doc.RegisType = getStrVal(raw, "regisType", "regis_type")
		doc.CommonSiteName = getStrVal(raw, "commonSiteName", "common_site_name")
		doc.OwnerName = getStrVal(raw, "owner", "owner_name")
		doc.Email = getStrVal(raw, "email")
		doc.Latitude = getFloat(raw, "latitude", "lat")
		doc.Longitude = getFloat(raw, "longitude", "lng")
		doc.Height = getFloat(raw, "height", "alt")
		doc.ReportInterval = int32(getInt(raw, "interval"))
		doc.IsVerify = int32(getInt(raw, "isverify", "isVerify"))
		doc.Issue = getStrVal(raw, "issue")
		doc.DIPort00 = getStrVal(raw, "diPort00")
		doc.DIPort01 = getStrVal(raw, "diPort01")
		doc.DIPort02 = getStrVal(raw, "diPort02")
		doc.DIPort03 = getStrVal(raw, "diPort03")
		doc.DIPort04 = getStrVal(raw, "diPort04")
		doc.DIPort05 = getStrVal(raw, "diPort05")
		doc.DIPort06 = getStrVal(raw, "diPort06")
		doc.DIPort07 = getStrVal(raw, "diPort07")

		list = append(list, &doc)
	}

	return list, nil
}

func (r *mongoRepository) GetRegistration(ctx context.Context, id string) (*domain.MongoDeviceRegistered, error) {
	coll := r.client.Database(r.dbName).Collection("iotRegistedIMEI")
	var filter bson.M
	if oid, err := primitive.ObjectIDFromHex(id); err == nil {
		filter = bson.M{"_id": oid}
	} else {
		filter = bson.M{"_id": id}
	}

	var raw bson.M
	err := coll.FindOne(ctx, filter).Decode(&raw)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("mongo: get registration: %w", err)
	}

	var doc domain.MongoDeviceRegistered
	doc.ID = id
	doc.AccountID = getStrVal(raw, "accountId")
	doc.Imei = getStrVal(raw, "imei", "IMEI")
	doc.StationID = getStrVal(raw, "station", "station_id")
	doc.RegisType = getStrVal(raw, "regisType", "regis_type")
	doc.CommonSiteName = getStrVal(raw, "commonSiteName", "common_site_name")
	doc.OwnerName = getStrVal(raw, "owner", "owner_name")
	doc.Email = getStrVal(raw, "email")
	doc.Latitude = getFloat(raw, "latitude", "lat")
	doc.Longitude = getFloat(raw, "longitude", "lng")
	doc.Height = getFloat(raw, "height", "alt")
	doc.ReportInterval = int32(getInt(raw, "interval"))
	doc.IsVerify = int32(getInt(raw, "isverify", "isVerify"))
	doc.Issue = getStrVal(raw, "issue")
	doc.DIPort00 = getStrVal(raw, "diPort00")
	doc.DIPort01 = getStrVal(raw, "diPort01")
	doc.DIPort02 = getStrVal(raw, "diPort02")
	doc.DIPort03 = getStrVal(raw, "diPort03")
	doc.DIPort04 = getStrVal(raw, "diPort04")
	doc.DIPort05 = getStrVal(raw, "diPort05")
	doc.DIPort06 = getStrVal(raw, "diPort06")
	doc.DIPort07 = getStrVal(raw, "diPort07")

	return &doc, nil
}

func (r *mongoRepository) CreateRegistration(ctx context.Context, reg *domain.MongoDeviceRegistered) (string, error) {
	coll := r.client.Database(r.dbName).Collection("iotRegistedIMEI")
	doc := bson.M{
		"accountId":      reg.AccountID,
		"imei":           reg.Imei,
		"station":        reg.StationID,
		"regisType":      reg.RegisType,
		"commonSiteName": reg.CommonSiteName,
		"owner":          reg.OwnerName,
		"email":          reg.Email,
		"latitude":       reg.Latitude,
		"longitude":      reg.Longitude,
		"height":         reg.Height,
		"interval":       reg.ReportInterval,
		"isverify":       reg.IsVerify,
		"issue":          reg.Issue,
		"diPort00":       reg.DIPort00,
		"diPort01":       reg.DIPort01,
		"diPort02":       reg.DIPort02,
		"diPort03":       reg.DIPort03,
		"diPort04":       reg.DIPort04,
		"diPort05":       reg.DIPort05,
		"diPort06":       reg.DIPort06,
		"diPort07":       reg.DIPort07,
	}

	res, err := coll.InsertOne(ctx, doc)
	if err != nil {
		return "", fmt.Errorf("mongo: create registration: %w", err)
	}

	if oid, ok := res.InsertedID.(primitive.ObjectID); ok {
		return oid.Hex(), nil
	}
	return fmt.Sprintf("%v", res.InsertedID), nil
}

func (r *mongoRepository) UpdateRegistration(ctx context.Context, id string, reg *domain.MongoDeviceRegistered) error {
	coll := r.client.Database(r.dbName).Collection("iotRegistedIMEI")
	var filter bson.M
	if oid, err := primitive.ObjectIDFromHex(id); err == nil {
		filter = bson.M{"_id": oid}
	} else {
		filter = bson.M{"_id": id}
	}

	update := bson.M{
		"$set": bson.M{
			"accountId":      reg.AccountID,
			"imei":           reg.Imei,
			"station":        reg.StationID,
			"regisType":      reg.RegisType,
			"commonSiteName": reg.CommonSiteName,
			"owner":          reg.OwnerName,
			"email":          reg.Email,
			"latitude":       reg.Latitude,
			"longitude":      reg.Longitude,
			"height":         reg.Height,
			"interval":       reg.ReportInterval,
			"isverify":       reg.IsVerify,
			"issue":          reg.Issue,
			"diPort00":       reg.DIPort00,
			"diPort01":       reg.DIPort01,
			"diPort02":       reg.DIPort02,
			"diPort03":       reg.DIPort03,
			"diPort04":       reg.DIPort04,
			"diPort05":       reg.DIPort05,
			"diPort06":       reg.DIPort06,
			"diPort07":       reg.DIPort07,
		},
	}

	_, err := coll.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("mongo: update registration: %w", err)
	}
	return nil
}

func (r *mongoRepository) DeleteRegistration(ctx context.Context, id string) error {
	coll := r.client.Database(r.dbName).Collection("iotRegistedIMEI")
	var filter bson.M
	if oid, err := primitive.ObjectIDFromHex(id); err == nil {
		filter = bson.M{"_id": oid}
	} else {
		filter = bson.M{"_id": id}
	}

	_, err := coll.DeleteOne(ctx, filter)
	if err != nil {
		return fmt.Errorf("mongo: delete registration: %w", err)
	}
	return nil
}

// ── iotDeviceInfo CRUD ───────────────────────────────────────────────────────

func (r *mongoRepository) ListSpecifications(ctx context.Context) ([]*domain.MongoDeviceInfo, error) {
	coll := r.client.Database(r.dbName).Collection("iotDeviceInfo")
	cursor, err := coll.Find(ctx, bson.M{})
	if err != nil {
		return nil, fmt.Errorf("mongo: list specifications: %w", err)
	}
	defer cursor.Close(ctx)

	var list []*domain.MongoDeviceInfo
	for cursor.Next(ctx) {
		var doc domain.MongoDeviceInfo
		var raw bson.M
		if err := cursor.Decode(&raw); err != nil {
			continue
		}

		if oid, ok := raw["_id"].(primitive.ObjectID); ok {
			doc.ID = oid.Hex()
		} else if s, ok := raw["_id"].(string); ok {
			doc.ID = s
		}

		doc.Imei = getStrVal(raw, "imei")
		doc.SerialNumber = getStrVal(raw, "serial", "serial_number")
		doc.SecretKey = getStrVal(raw, "secretKey", "secret_key")
		doc.CommonSiteName = getStrVal(raw, "commonSiteName")
		doc.RegistrationDate = getStrVal(raw, "registrationDate")
		doc.Station = getStrVal(raw, "station")
		doc.RegisType = getStrVal(raw, "regisType")
		doc.PurchaseDate = getStrVal(raw, "purchaseDate")
		doc.ShippingDate = getStrVal(raw, "shippingDate")

		list = append(list, &doc)
	}
	return list, nil
}

func (r *mongoRepository) GetSpecification(ctx context.Context, id string) (*domain.MongoDeviceInfo, error) {
	coll := r.client.Database(r.dbName).Collection("iotDeviceInfo")
	var filter bson.M
	if oid, err := primitive.ObjectIDFromHex(id); err == nil {
		filter = bson.M{"_id": oid}
	} else {
		filter = bson.M{"_id": id}
	}

	var raw bson.M
	err := coll.FindOne(ctx, filter).Decode(&raw)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("mongo: get specification: %w", err)
	}

	var doc domain.MongoDeviceInfo
	doc.ID = id
	doc.Imei = getStrVal(raw, "imei")
	doc.SerialNumber = getStrVal(raw, "serial", "serial_number")
	doc.SecretKey = getStrVal(raw, "secretKey", "secret_key")
	doc.CommonSiteName = getStrVal(raw, "commonSiteName")
	doc.RegistrationDate = getStrVal(raw, "registrationDate")
	doc.Station = getStrVal(raw, "station")
	doc.RegisType = getStrVal(raw, "regisType")
	doc.PurchaseDate = getStrVal(raw, "purchaseDate")
	doc.ShippingDate = getStrVal(raw, "shippingDate")

	return &doc, nil
}

func (r *mongoRepository) CreateSpecification(ctx context.Context, spec *domain.MongoDeviceInfo) (string, error) {
	coll := r.client.Database(r.dbName).Collection("iotDeviceInfo")
	doc := bson.M{
		"imei":             spec.Imei,
		"serial":           spec.SerialNumber,
		"secretKey":        spec.SecretKey,
		"commonSiteName":   spec.CommonSiteName,
		"registrationDate": spec.RegistrationDate,
		"station":          spec.Station,
		"regisType":        spec.RegisType,
		"purchaseDate":     spec.PurchaseDate,
		"shippingDate":     spec.ShippingDate,
	}

	res, err := coll.InsertOne(ctx, doc)
	if err != nil {
		return "", fmt.Errorf("mongo: create specification: %w", err)
	}

	if oid, ok := res.InsertedID.(primitive.ObjectID); ok {
		return oid.Hex(), nil
	}
	return fmt.Sprintf("%v", res.InsertedID), nil
}

func (r *mongoRepository) UpdateSpecification(ctx context.Context, id string, spec *domain.MongoDeviceInfo) error {
	coll := r.client.Database(r.dbName).Collection("iotDeviceInfo")
	var filter bson.M
	if oid, err := primitive.ObjectIDFromHex(id); err == nil {
		filter = bson.M{"_id": oid}
	} else {
		filter = bson.M{"_id": id}
	}

	update := bson.M{
		"$set": bson.M{
			"imei":             spec.Imei,
			"serial":           spec.SerialNumber,
			"secretKey":        spec.SecretKey,
			"commonSiteName":   spec.CommonSiteName,
			"registrationDate": spec.RegistrationDate,
			"station":          spec.Station,
			"regisType":        spec.RegisType,
			"purchaseDate":     spec.PurchaseDate,
			"shippingDate":     spec.ShippingDate,
		},
	}

	_, err := coll.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("mongo: update specification: %w", err)
	}
	return nil
}

func (r *mongoRepository) DeleteSpecification(ctx context.Context, id string) error {
	coll := r.client.Database(r.dbName).Collection("iotDeviceInfo")
	var filter bson.M
	if oid, err := primitive.ObjectIDFromHex(id); err == nil {
		filter = bson.M{"_id": oid}
	} else {
		filter = bson.M{"_id": id}
	}

	_, err := coll.DeleteOne(ctx, filter)
	if err != nil {
		return fmt.Errorf("mongo: delete specification: %w", err)
	}
	return nil
}

// ── BSON Parse Helpers ───────────────────────────────────────────────────────

func getStrVal(m bson.M, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k].(string); ok {
			return v
		}
	}
	return ""
}

func getFloat(m bson.M, keys ...string) float64 {
	for _, k := range keys {
		switch v := m[k].(type) {
		case float64:
			return v
		case int64:
			return float64(v)
		case int32:
			return float64(v)
		}
	}
	return 0
}

func getInt(m bson.M, keys ...string) int64 {
	for _, k := range keys {
		switch v := m[k].(type) {
		case int64:
			return v
		case int32:
			return int64(v)
		case float64:
			return int64(v)
		}
	}
	return 0
}
